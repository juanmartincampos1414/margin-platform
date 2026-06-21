import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import * as XLSX from 'xlsx'
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

// FR-028 Menu Parsing — detect categories, products, selling prices only.
// AI Requirements: never infer ingredients, gramajes, cantidades or costos;
// never invent data; mark low confidence as review-required.
const PROMPT = `Analizá este menú/carta de restaurante y extraé categorías y productos en JSON.

Identificá las categorías del menú (ej: Entradas, Principales, Postres, Bebidas, Cafetería, Cocktails) y, para cada producto, su nombre, precio de venta y la categoría a la que pertenece.

No inventes productos ni precios que no estén presentes. No infieras ingredientes, gramajes, cantidades ni costos — eso no es parte de esta extracción. Si un precio no es legible, usá null. Si tenés dudas relevantes sobre la extracción, bajá el valor de "confidence" en lugar de adivinar.

Respondé ÚNICAMENTE con JSON válido:
{
  "confidence": número del 0 al 100,
  "categories": ["nombre de categoría 1", "nombre de categoría 2"],
  "items": [
    {
      "name": "nombre del producto",
      "category": "nombre de categoría tal como aparece arriba",
      "selling_price": número o null
    }
  ]
}`

// FR-033 Duplicate Detection — exact normalized-name matches, plus a simple
// prefix heuristic so "Negroni" / "NEGRONI" / "Negroni Clásico" are flagged
// as possible duplicates without needing a fuzzy-matching library.
function isDuplicatePair(a: string, b: string) {
  if (a === b) return true
  return a.startsWith(b) || b.startsWith(a)
}

export async function POST(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const { anthropic, adminSupabase } = getClients()
  const { importId } = await req.json()

  if (!importId) {
    return NextResponse.json({ error: 'Missing importId' }, { status: 400 })
  }

  const { data: menuImport } = await adminSupabase
    .from('menu_imports')
    .select('*')
    .eq('id', importId)
    .single()

  if (!menuImport) {
    return NextResponse.json({ error: 'Menu import not found' }, { status: 404 })
  }

  // Never trust importId alone — the admin client below bypasses RLS.
  if (menuImport.restaurant_id !== restaurantId) {
    return NextResponse.json({ error: 'Menu import not found' }, { status: 404 })
  }

  await adminSupabase.from('menu_imports').update({ status: 'processing' }).eq('id', importId)

  try {
    const fileName = (menuImport.file_name || '').toLowerCase()
    const res = await fetch(menuImport.file_url)
    const buf = await res.arrayBuffer()

    let messageContent: any[]

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.csv')) {
      // Structured files are converted to plain text and sent to Claude as
      // text, not vision — there's no layout ambiguity to resolve, and this
      // avoids needing bespoke column-mapping heuristics for arbitrary
      // spreadsheet shapes.
      let text: string
      if (fileName.endsWith('.csv')) {
        text = Buffer.from(buf).toString('utf-8')
      } else {
        const workbook = XLSX.read(buf, { type: 'buffer' })
        const sheet = workbook.Sheets[workbook.SheetNames[0]]
        text = XLSX.utils.sheet_to_csv(sheet)
      }
      messageContent = [{ type: 'text', text: `${PROMPT}\n\nContenido del archivo:\n${text}` }]
    } else {
      const isPdf = fileName.endsWith('.pdf')
      const mediaType = isPdf
        ? 'application/pdf'
        : fileName.endsWith('.png') ? 'image/png' : 'image/jpeg'
      const base64 = Buffer.from(buf).toString('base64')
      messageContent = [
        isPdf
          ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
          : { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: PROMPT },
      ]
    }

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: messageContent }],
    })

    const text = (message.content[0] as any).text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in extraction response')
    const extracted = JSON.parse(jsonMatch[0])

    // FR-029 Menu Creation — categories and items, status pending_review.
    const categoryIdByName = new Map<string, string>()
    for (const categoryName of extracted.categories || []) {
      if (!categoryName) continue
      let { data: category } = await adminSupabase
        .from('menu_categories')
        .select('id')
        .eq('restaurant_id', restaurantId)
        .ilike('name', categoryName)
        .maybeSingle()

      if (!category) {
        const { data: created } = await adminSupabase
          .from('menu_categories')
          .insert({ restaurant_id: restaurantId, name: categoryName })
          .select('id')
          .single()
        category = created
      }
      if (category) categoryIdByName.set(categoryName, category.id)
    }

    const items = extracted.items || []
    const createdItems: any[] = []
    for (const item of items) {
      if (!item.name) continue
      const { data: created } = await adminSupabase
        .from('menu_items')
        .insert({
          restaurant_id: restaurantId,
          menu_import_id: importId,
          category_id: item.category ? categoryIdByName.get(item.category) || null : null,
          name: item.name,
          normalized_name: normalizeIngredientName(item.name),
          selling_price: item.selling_price || 0,
          status: 'pending_review',
        })
        .select('*, menu_categories(id, name)')
        .single()
      if (created) createdItems.push(created)
    }

    // FR-033 Duplicate Detection, computed against every non-archived item
    // in the restaurant (not just this import), so a re-import of an
    // already-confirmed dish is also caught.
    const { data: allActiveItems } = await adminSupabase
      .from('menu_items')
      .select('id, name, normalized_name')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'archived')

    const duplicateGroups: Record<string, string[]> = {}
    for (const item of allActiveItems || []) {
      for (const other of allActiveItems || []) {
        if (item.id === other.id) continue
        if (isDuplicatePair(item.normalized_name, other.normalized_name)) {
          duplicateGroups[item.id] = duplicateGroups[item.id] || []
          duplicateGroups[item.id].push(other.id)
        }
      }
    }

    const { data: updatedImport } = await adminSupabase
      .from('menu_imports')
      .update({ status: 'completed' })
      .eq('id', importId)
      .select()
      .single()

    return NextResponse.json({
      menuImport: updatedImport,
      confidence: extracted.confidence,
      items: createdItems,
      duplicates: duplicateGroups,
    })
  } catch (e: any) {
    await adminSupabase.from('menu_imports').update({ status: 'failed' }).eq('id', importId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
