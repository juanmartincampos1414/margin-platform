import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurant } from '@/lib/auth'
import { normalizeIngredientName } from '@/lib/utils'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'

// Each call processes one chunk of CHUNK_SIZE pages.
// The frontend loops until done:true, so each request stays within Vercel's limits.
const CHUNK_SIZE = 15

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

async function extractPageRange(pdfBytes: Buffer, from: number, to: number): Promise<string> {
  const src = await PDFDocument.load(pdfBytes)
  const dst = await PDFDocument.create()
  const indices = Array.from({ length: to - from }, (_, i) => from + i)
  const pages = await dst.copyPages(src, indices)
  pages.forEach((p: any) => dst.addPage(p))
  const bytes = await dst.save()
  return Buffer.from(bytes).toString('base64')
}

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

function buildPrompt(ingredientCtx: string, recipeCtx: string, pageInfo?: string): string {
  return `Analizá este documento y extraé todas las recetas que encuentres.${pageInfo ? `\n${pageInfo}` : ''}
${ingredientCtx}
${recipeCtx}

Para cada receta identificá nombre, precio de venta (si aparece), porciones (default 1) e ingredientes con cantidad y unidad.
Si el nombre coincide con una receta existente, marcá possible_duplicate: true.
Si un ingrediente coincide con uno registrado, usá el mismo nombre exacto.

Respondé ÚNICAMENTE con JSON válido, sin texto adicional:
{
  "confidence": 0-100,
  "recipes": [
    {
      "name": "nombre del plato",
      "sale_price": número o null,
      "portions": 1,
      "confidence": 0-100,
      "possible_duplicate": false,
      "ingredients": [
        { "name": "nombre", "quantity": número o null, "unit": "kg|g|lt|ml|un|etc" }
      ]
    }
  ]
}`
}

async function callClaude(anthropic: Anthropic, content: any[]): Promise<{ recipes: any[]; confidence: number }> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content }],
  })

  const text = (message.content[0] as any).text
  const jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error(`No JSON in response (stop_reason: ${message.stop_reason})`)

  let raw = jsonMatch[0].replace(/,(\s*[\]}])/g, '$1')
  try {
    const parsed = JSON.parse(raw)
    return { recipes: parsed.recipes || [], confidence: parsed.confidence || 0 }
  } catch (e: any) {
    console.error('[recipes/process] JSON parse failed, stop_reason:', message.stop_reason, 'tail:', raw.slice(-200))
    throw new Error(`JSON parse error (stop_reason: ${message.stop_reason}): ${e.message}`)
  }
}

export async function POST(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  // startPage: which page offset this chunk begins at (0 for first call).
  // Frontend loops, incrementing by CHUNK_SIZE, until done:true.
  const { importId, startPage = 0 } = await req.json()
  if (!importId) return NextResponse.json({ error: 'Missing importId' }, { status: 400 })

  const { anthropic, adminSupabase } = getClients()

  const { data: importRow } = await adminSupabase
    .from('recipe_imports').select('*').eq('id', importId).single()

  if (!importRow || importRow.restaurant_id !== restaurantId) {
    return NextResponse.json({ error: 'Import not found' }, { status: 404 })
  }

  if (startPage === 0) {
    await adminSupabase.from('recipe_imports').update({ status: 'processing' }).eq('id', importId)
  }

  try {
    const [{ data: existingIngredients }, { data: existingRecipes }, { data: menuItems }] = await Promise.all([
      adminSupabase.from('ingredients').select('id, name, normalized_name, unit').eq('restaurant_id', restaurantId).neq('status', 'archived'),
      adminSupabase.from('recipes').select('id, name').eq('restaurant_id', restaurantId).eq('status', 'active'),
      adminSupabase.from('menu_items').select('id, name, recipe_id').eq('restaurant_id', restaurantId).eq('status', 'active'),
    ])

    const ingredientCtx = (existingIngredients || []).length > 0
      ? `\nIngredientes ya registrados:\n${(existingIngredients || []).map((i: any) => `- ${i.name} (${i.unit})`).join('\n')}`
      : ''
    const recipeCtx = (existingRecipes || []).length > 0
      ? `\nRecetas ya existentes:\n${(existingRecipes || []).map((r: any) => `- ${r.name}`).join('\n')}`
      : ''

    const ext = importRow.file_name?.toLowerCase().split('.').pop() || ''
    const isSpreadsheet = ['xlsx', 'xls', 'csv'].includes(ext)
    const isPdf = ext === 'pdf'

    let recipes: any[] = []
    let confidence = 0
    let totalPages = 1
    let endPage = 1

    if (isSpreadsheet) {
      // Spreadsheets: always single call, startPage irrelevant
      const text = await spreadsheetToText(importRow.file_url, ext)
      const result = await callClaude(anthropic, [
        { type: 'text', text: `Datos del recetario:\n\n${text}` },
        { type: 'text', text: buildPrompt(ingredientCtx, recipeCtx) },
      ])
      recipes = result.recipes
      confidence = result.confidence

    } else if (isPdf) {
      const pdfBytes = await fetchBytes(importRow.file_url)
      const srcDoc = await PDFDocument.load(pdfBytes)
      totalPages = srcDoc.getPageCount()
      endPage = Math.min(startPage + CHUNK_SIZE, totalPages)

      const pageInfo = totalPages > CHUNK_SIZE
        ? `Estás viendo las páginas ${startPage + 1}–${endPage} de ${totalPages} del recetario.`
        : undefined

      const base64 = await extractPageRange(pdfBytes, startPage, endPage)
      const result = await callClaude(anthropic, [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: buildPrompt(ingredientCtx, recipeCtx, pageInfo) },
      ])
      recipes = result.recipes
      confidence = result.confidence

    } else {
      // Image: single call
      const base64 = (await fetchBytes(importRow.file_url)).toString('base64')
      const mediaType = ext === 'png' ? 'image/png' : 'image/jpeg'
      const result = await callClaude(anthropic, [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: buildPrompt(ingredientCtx, recipeCtx) },
      ])
      recipes = result.recipes
      confidence = result.confidence
    }

    // Build lookups for matching
    const ingredientByNorm = new Map<string, any>()
    for (const ing of existingIngredients || []) ingredientByNorm.set(ing.normalized_name, ing)

    const recipeByNorm = new Map<string, any>()
    for (const r of existingRecipes || []) recipeByNorm.set(normalizeIngredientName(r.name), r)

    // Only match against menu items that don't yet have a recipe
    const unlinkedMenuItems = (menuItems || [])
      .filter((m: any) => !m.recipe_id)
      .map((m: any) => ({ id: m.id, norm: normalizeIngredientName(m.name) }))

    // Deduplicate against already-imported items from earlier chunks
    const { data: existingItems } = await adminSupabase
      .from('recipe_import_items')
      .select('proposed_name')
      .eq('import_id', importId)

    const alreadyImported = new Set((existingItems || []).map((i: any) => normalizeIngredientName(i.proposed_name)))

    const itemsToInsert = recipes
      .filter(r => !alreadyImported.has(normalizeIngredientName(r.name)))
      .map((r: any) => {
        const rawIngredients = (r.ingredients || []).map((ing: any) => {
          const norm = normalizeIngredientName(ing.name)
          const matched = ingredientByNorm.get(norm)
          return { name: ing.name, quantity: ing.quantity, unit: ing.unit, matched_ingredient_id: matched?.id || null, confidence: matched ? 90 : 50, corrected: false }
        })

        const normName = normalizeIngredientName(r.name)
        const existingRecipe = recipeByNorm.get(normName)

        let bestMenuMatch: { id: string; score: number } | null = null
        for (const mi of unlinkedMenuItems) {
          const score = matchScore(normName, mi.norm)
          if (score >= 65 && (!bestMenuMatch || score > bestMenuMatch.score)) {
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

    const isDone = !isPdf || endPage >= totalPages

    if (isDone) {
      // Compute final confidence as average across all processed chunks
      const { data: allItems } = await adminSupabase
        .from('recipe_import_items').select('confidence').eq('import_id', importId)
      const finalConfidence = allItems && allItems.length > 0
        ? Math.round(allItems.reduce((s: number, i: any) => s + (i.confidence || 0), 0) / allItems.length)
        : confidence

      await adminSupabase.from('recipe_imports').update({
        status: 'review_required',
        ocr_confidence: finalConfidence,
        processed_at: new Date().toISOString(),
      }).eq('id', importId)
    }

    return NextResponse.json({
      done: isDone,
      nextPage: isDone ? null : endPage,
      totalPages,
      processedPages: endPage,
      recipesFoundInChunk: itemsToInsert.length,
    })

  } catch (e: any) {
    await adminSupabase.from('recipe_imports').update({ status: 'failed' }).eq('id', importId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
