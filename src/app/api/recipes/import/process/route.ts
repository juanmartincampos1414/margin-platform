import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurant } from '@/lib/auth'
import { normalizeIngredientName } from '@/lib/utils'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'

// Extend Vercel serverless timeout — large recetarios (76+ pages) need up to 3 min.
export const maxDuration = 300

const CHUNK_SIZE = 20 // pages per Claude call

function getClients() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return { anthropic, adminSupabase }
}

async function fetchBytes(url: string): Promise<Buffer> {
  const res = await fetch(url)
  return Buffer.from(await res.arrayBuffer())
}

// Split a PDF buffer into chunks of up to CHUNK_SIZE pages.
// Returns each chunk as a base64-encoded PDF string.
async function splitPdf(pdfBytes: Buffer): Promise<string[]> {
  const srcDoc = await PDFDocument.load(pdfBytes)
  const totalPages = srcDoc.getPageCount()
  const chunks: string[] = []

  for (let start = 0; start < totalPages; start += CHUNK_SIZE) {
    const end = Math.min(start + CHUNK_SIZE, totalPages)
    const chunkDoc = await PDFDocument.create()
    const pageIndices = Array.from({ length: end - start }, (_, i) => start + i)
    const copiedPages = await chunkDoc.copyPages(srcDoc, pageIndices)
    copiedPages.forEach((p: any) => chunkDoc.addPage(p))
    const chunkBytes = await chunkDoc.save()
    chunks.push(Buffer.from(chunkBytes).toString('base64'))
  }
  return chunks
}

// Convert xlsx/xls/csv to compact text. Claude cannot read xlsx binary.
async function spreadsheetToText(url: string, ext: string): Promise<string> {
  const buf = await fetchBytes(url)
  if (ext === 'csv') return buf.toString('utf-8').slice(0, 80000)

  const workbook = XLSX.read(buf, { type: 'buffer' })
  const parts: string[] = []
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    const csv = XLSX.utils.sheet_to_csv(sheet, { blankrows: false })
    const rows = csv.split('\n').filter(r => r.trim()).slice(0, 500)
    if (rows.length > 0) parts.push(`=== Hoja: ${sheetName} ===\n${rows.join('\n')}`)
  }
  return parts.join('\n\n').slice(0, 80000)
}

function matchScore(a: string, b: string): number {
  if (a === b) return 100
  if (a.includes(b) || b.includes(a)) return 90
  const tokA = new Set(a.split(/\s+/).filter(t => t.length > 2))
  const tokB = new Set(b.split(/\s+/).filter(t => t.length > 2))
  if (tokA.size === 0 || tokB.size === 0) return 0
  let shared = 0
  for (const t of tokA) if (tokB.has(t)) shared++
  return Math.round((shared * 2 / (tokA.size + tokB.size)) * 100)
}

function buildPrompt(ingredientContext: string, recipeContext: string, chunkInfo?: string): string {
  return `Analizá este documento y extraé todas las recetas que encuentres.${chunkInfo ? `\n${chunkInfo}` : ''}
${ingredientContext}
${recipeContext}

Para cada receta identificá:
- Nombre del plato
- Precio de venta si aparece
- Número de porciones (1 si no aparece)
- Lista de ingredientes con cantidad y unidad

Si el nombre de un plato coincide con una receta ya existente, indicalo en "possible_duplicate".
Si un ingrediente coincide con uno de los registrados, usá el mismo nombre exacto.

Respondé ÚNICAMENTE con JSON válido:
{
  "confidence": 0-100,
  "recipes": [
    {
      "name": "nombre del plato",
      "sale_price": número o null,
      "portions": número (default 1),
      "confidence": 0-100,
      "possible_duplicate": true o false,
      "ingredients": [
        {
          "name": "nombre tal como aparece en el documento",
          "quantity": número o null,
          "unit": "kg|g|lt|ml|un|porciones|etc"
        }
      ]
    }
  ]
}`
}

async function callClaude(
  anthropic: Anthropic,
  messageContent: any[],
): Promise<{ recipes: any[]; confidence: number }> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: messageContent }],
  })

  const text = (message.content[0] as any).text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in OCR response (stop_reason: ${message.stop_reason})`)

  let raw = jsonMatch[0].replace(/,(\s*[\]}])/g, '$1')
  try {
    const parsed = JSON.parse(raw)
    return { recipes: parsed.recipes || [], confidence: parsed.confidence || 0 }
  } catch (e: any) {
    console.error('[recipes/process] JSON parse failed. stop_reason:', message.stop_reason, 'raw length:', raw.length, 'tail:', raw.slice(-200))
    throw new Error(`JSON parse error after OCR (stop_reason: ${message.stop_reason}): ${e.message}`)
  }
}

export async function POST(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const { importId } = await req.json()
  if (!importId) return NextResponse.json({ error: 'Missing importId' }, { status: 400 })

  const { anthropic, adminSupabase } = getClients()

  const { data: importRow } = await adminSupabase
    .from('recipe_imports')
    .select('*')
    .eq('id', importId)
    .single()

  if (!importRow || importRow.restaurant_id !== restaurantId) {
    return NextResponse.json({ error: 'Import not found' }, { status: 404 })
  }

  await adminSupabase.from('recipe_imports').update({ status: 'processing' }).eq('id', importId)

  try {
    const [{ data: existingIngredients }, { data: existingRecipes }, { data: menuItems }] = await Promise.all([
      adminSupabase.from('ingredients').select('id, name, normalized_name, unit, current_price').eq('restaurant_id', restaurantId).neq('status', 'archived'),
      adminSupabase.from('recipes').select('id, name').eq('restaurant_id', restaurantId).eq('status', 'active'),
      adminSupabase.from('menu_items').select('id, name, recipe_id').eq('restaurant_id', restaurantId).eq('status', 'active'),
    ])

    const ingredientContext = (existingIngredients || []).length > 0
      ? `\nIngredientes ya registrados:\n${(existingIngredients || []).map((i: any) => `- ${i.name} (${i.unit})`).join('\n')}`
      : ''
    const recipeContext = (existingRecipes || []).length > 0
      ? `\nRecetas ya existentes:\n${(existingRecipes || []).map((r: any) => `- ${r.name}`).join('\n')}`
      : ''

    const ext = importRow.file_name?.toLowerCase().split('.').pop() || ''
    const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(ext)
    const isPdf = ext === 'pdf'

    let allRecipes: any[] = []
    let overallConfidence = 0

    if (isSpreadsheet) {
      const text = await spreadsheetToText(importRow.file_url, ext)
      const content = [
        { type: 'text', text: `Datos del recetario en formato CSV/texto:\n\n${text}` },
        { type: 'text', text: buildPrompt(ingredientContext, recipeContext) },
      ]
      const result = await callClaude(anthropic, content)
      allRecipes = result.recipes
      overallConfidence = result.confidence

    } else if (isPdf) {
      const pdfBytes = await fetchBytes(importRow.file_url)
      const srcDoc = await PDFDocument.load(pdfBytes)
      const totalPages = srcDoc.getPageCount()

      if (totalPages <= CHUNK_SIZE) {
        // Small PDF — process in one call
        const base64 = pdfBytes.toString('base64')
        const content = [
          { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
          { type: 'text', text: buildPrompt(ingredientContext, recipeContext) },
        ]
        const result = await callClaude(anthropic, content)
        allRecipes = result.recipes
        overallConfidence = result.confidence
      } else {
        // Large PDF — split into chunks and process sequentially
        const chunks = await splitPdf(pdfBytes)
        const confidences: number[] = []

        for (let i = 0; i < chunks.length; i++) {
          const chunkInfo = `Nota: este es el fragmento ${i + 1} de ${chunks.length} del recetario (páginas ${i * CHUNK_SIZE + 1}–${Math.min((i + 1) * CHUNK_SIZE, totalPages)} de ${totalPages}).`
          const content = [
            { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: chunks[i] } },
            { type: 'text', text: buildPrompt(ingredientContext, recipeContext, chunkInfo) },
          ]
          const result = await callClaude(anthropic, content)
          allRecipes.push(...result.recipes)
          confidences.push(result.confidence)
        }

        overallConfidence = confidences.length
          ? Math.round(confidences.reduce((s, c) => s + c, 0) / confidences.length)
          : 0

        // Deduplicate by normalized name — keep first occurrence (earlier pages win)
        const seen = new Set<string>()
        allRecipes = allRecipes.filter(r => {
          const key = normalizeIngredientName(r.name)
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
      }

    } else {
      // Image
      const base64 = (await fetchBytes(importRow.file_url)).toString('base64')
      const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg'
      const content = [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: buildPrompt(ingredientContext, recipeContext) },
      ]
      const result = await callClaude(anthropic, content)
      allRecipes = result.recipes
      overallConfidence = result.confidence
    }

    // Build lookups for matching
    const ingredientByNorm = new Map<string, any>()
    for (const ing of existingIngredients || []) ingredientByNorm.set(ing.normalized_name, ing)

    const recipeByNormName = new Map<string, any>()
    for (const r of existingRecipes || []) recipeByNormName.set(normalizeIngredientName(r.name), r)

    const unlinkedMenuItems = (menuItems || []).filter((m: any) => !m.recipe_id)
    const menuItemNorms = unlinkedMenuItems.map((m: any) => ({
      id: m.id, name: m.name, norm: normalizeIngredientName(m.name),
    }))

    const itemsToInsert = allRecipes.map((r: any) => {
      const rawIngredients = (r.ingredients || []).map((ing: any) => {
        const norm = normalizeIngredientName(ing.name)
        const matched = ingredientByNorm.get(norm)
        return {
          name: ing.name, quantity: ing.quantity, unit: ing.unit,
          matched_ingredient_id: matched?.id || null,
          confidence: matched ? 90 : 50,
          corrected: false,
        }
      })

      const normName = normalizeIngredientName(r.name)
      const existingRecipe = recipeByNormName.get(normName)

      let bestMenuMatch: { id: string; score: number } | null = null
      for (const mi of menuItemNorms) {
        const score = matchScore(normName, mi.norm)
        if (score >= 70 && (!bestMenuMatch || score > bestMenuMatch.score)) {
          bestMenuMatch = { id: mi.id, score }
        }
      }

      return {
        import_id: importId,
        restaurant_id: restaurantId,
        proposed_name: r.name,
        proposed_sale_price: r.sale_price || null,
        proposed_portions: r.portions || 1,
        confidence: r.confidence,
        status: 'pending',
        matched_recipe_id: (r.possible_duplicate && existingRecipe) ? existingRecipe.id : null,
        matched_menu_item_id: bestMenuMatch?.id || null,
        menu_match_confidence: bestMenuMatch?.score || null,
        raw_ingredients: rawIngredients,
      }
    })

    if (itemsToInsert.length > 0) {
      await adminSupabase.from('recipe_import_items').insert(itemsToInsert)
    }

    await adminSupabase.from('recipe_imports').update({
      status: 'review_required',
      ocr_confidence: overallConfidence,
      extracted_data: { confidence: overallConfidence, recipes: allRecipes },
      processed_at: new Date().toISOString(),
    }).eq('id', importId)

    return NextResponse.json({ importId, recipeCount: itemsToInsert.length, confidence: overallConfidence })

  } catch (e: any) {
    await adminSupabase.from('recipe_imports').update({ status: 'failed' }).eq('id', importId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
