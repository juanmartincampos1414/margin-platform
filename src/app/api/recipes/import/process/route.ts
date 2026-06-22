import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurant } from '@/lib/auth'
import { normalizeIngredientName } from '@/lib/utils'

function getClients() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return { anthropic, adminSupabase }
}

async function fileToBase64(url: string) {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  return Buffer.from(buf).toString('base64')
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
    const { data: existingIngredients } = await adminSupabase
      .from('ingredients')
      .select('id, name, normalized_name, unit, current_price')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'archived')

    const ingredientContext = (existingIngredients || []).length > 0
      ? `\nIngredientes ya registrados en el sistema:\n${(existingIngredients || []).map((i: any) => `- ${i.name} (${i.unit}): $${i.current_price}`).join('\n')}`
      : ''

    const { data: existingRecipes } = await adminSupabase
      .from('recipes')
      .select('id, name')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')

    const recipeContext = (existingRecipes || []).length > 0
      ? `\nRecetas ya existentes:\n${(existingRecipes || []).map((r: any) => `- ${r.name}`).join('\n')}`
      : ''

    const prompt = `Analizá este documento y extraé todas las recetas que encuentres.
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

    const isPdf = importRow.file_name?.toLowerCase().endsWith('.pdf')
    const ext = importRow.file_name?.toLowerCase().split('.').pop()
    const mediaType = isPdf ? 'application/pdf'
      : ext === 'png' ? 'image/png'
      : 'image/jpeg'

    const base64 = await fileToBase64(importRow.file_url)
    const messageContent: any[] = []

    if (isPdf) {
      messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } })
    } else if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
      // For spreadsheets, send as document
      messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } })
    } else {
      messageContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } })
    }
    messageContent.push({ type: 'text', text: prompt })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 8192,
      messages: [{ role: 'user', content: messageContent }],
    })

    const text = (message.content[0] as any).text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in OCR response')

    let raw = jsonMatch[0]
    raw = raw.replace(/,(\s*[\]}])/g, '$1')  // trailing commas

    let extracted: any
    try {
      extracted = JSON.parse(raw)
    } catch (parseErr: any) {
      console.error('[recipes/process] JSON parse failed. stop_reason:', message.stop_reason, '| raw length:', raw.length)
      console.error('[recipes/process] raw tail:', raw.slice(-300))
      throw new Error(`JSON parse error: ${parseErr.message} (stop_reason: ${message.stop_reason})`)
    }

    const recipes = extracted.recipes || []

    // Build ingredient lookup by normalized name for matching
    const ingredientByNorm = new Map<string, any>()
    for (const ing of existingIngredients || []) {
      ingredientByNorm.set(ing.normalized_name, ing)
    }

    // Build recipe lookup for duplicate detection
    const recipeByNormName = new Map<string, any>()
    for (const r of existingRecipes || []) {
      recipeByNormName.set(normalizeIngredientName(r.name), r)
    }

    // Create recipe_import_items for each extracted recipe
    const itemsToInsert = recipes.map((r: any) => {
      const rawIngredients = (r.ingredients || []).map((ing: any) => {
        const norm = normalizeIngredientName(ing.name)
        const matched = ingredientByNorm.get(norm)
        return {
          name: ing.name,
          quantity: ing.quantity,
          unit: ing.unit,
          matched_ingredient_id: matched?.id || null,
          confidence: matched ? 90 : 50,
          corrected: false,
        }
      })

      const normName = normalizeIngredientName(r.name)
      const existingRecipe = recipeByNormName.get(normName)

      return {
        import_id: importId,
        restaurant_id: restaurantId,
        proposed_name: r.name,
        proposed_sale_price: r.sale_price || null,
        proposed_portions: r.portions || 1,
        confidence: r.confidence,
        status: 'pending',
        matched_recipe_id: (r.possible_duplicate && existingRecipe) ? existingRecipe.id : null,
        raw_ingredients: rawIngredients,
      }
    })

    if (itemsToInsert.length > 0) {
      await adminSupabase.from('recipe_import_items').insert(itemsToInsert)
    }

    const finalStatus = extracted.confidence >= 60 ? 'review_required' : 'review_required'

    await adminSupabase.from('recipe_imports').update({
      status: finalStatus,
      ocr_confidence: extracted.confidence,
      extracted_data: extracted,
      processed_at: new Date().toISOString(),
    }).eq('id', importId)

    return NextResponse.json({ importId, recipeCount: itemsToInsert.length, confidence: extracted.confidence })
  } catch (e: any) {
    await adminSupabase.from('recipe_imports').update({ status: 'failed' }).eq('id', importId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
