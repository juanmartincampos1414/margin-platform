import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurant } from '@/lib/auth'

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
    .from('operations_imports')
    .select('*')
    .eq('id', importId)
    .single()

  if (!importRow || importRow.restaurant_id !== restaurantId) {
    return NextResponse.json({ error: 'Import not found' }, { status: 404 })
  }

  await adminSupabase.from('operations_imports').update({ status: 'processing' }).eq('id', importId)

  try {
    // Load menu items for product mix matching
    const { data: menuItems } = await adminSupabase
      .from('menu_items')
      .select('id, name')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active')

    const menuContext = (menuItems || []).length > 0
      ? `\nProductos del menú activo:\n${(menuItems || []).map((m: any) => `- ${m.name}`).join('\n')}`
      : ''

    const prompt = `Analizá este documento (cierre de caja, reporte POS, planilla de ventas o captura de pantalla de sistema).
Extraé datos operativos: ventas, cubiertos, ticket promedio, medios de pago, y mix de productos si está disponible.
${menuContext}

Para el mix de productos, intentá hacer match con los nombres del menú.
Si hay datos para múltiples días, extraé cada día por separado.

Respondé ÚNICAMENTE con JSON válido:
{
  "confidence": 0-100,
  "period_start": "YYYY-MM-DD o null",
  "period_end": "YYYY-MM-DD o null",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "total_revenue": número o null,
      "total_covers": número entero o null,
      "avg_ticket": número o null,
      "cash_amount": número o null,
      "card_amount": número o null,
      "transfer_amount": número o null,
      "other_payment_amount": número o null,
      "lunch_covers": número entero o null,
      "dinner_covers": número entero o null,
      "product_mix": [
        {
          "item_name": "nombre del producto",
          "matched_menu_item": "nombre exacto del menú si matchea, null si no",
          "quantity_sold": número entero o null,
          "unit_revenue": número o null,
          "total_revenue": número o null
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
    } else {
      messageContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } })
    }
    messageContent.push({ type: 'text', text: prompt })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: messageContent }],
    })

    const text = (message.content[0] as any).text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in OCR response')
    const extracted = JSON.parse(jsonMatch[0])

    // Build menu item lookup for matching
    const menuItemByName = new Map<string, string>()
    for (const m of menuItems || []) {
      menuItemByName.set(m.name.toLowerCase().trim(), m.id)
    }

    // Create draft daily_operations rows
    const days = extracted.days || []
    for (const day of days) {
      const { data: opRow } = await adminSupabase
        .from('daily_operations')
        .insert({
          restaurant_id: restaurantId,
          import_id: importId,
          operation_date: day.date,
          total_revenue: day.total_revenue,
          total_covers: day.total_covers,
          avg_ticket: day.avg_ticket,
          cash_amount: day.cash_amount,
          card_amount: day.card_amount,
          transfer_amount: day.transfer_amount,
          other_payment_amount: day.other_payment_amount,
          lunch_covers: day.lunch_covers,
          dinner_covers: day.dinner_covers,
          status: 'draft',
        })
        .select('id')
        .single()

      if (!opRow) continue

      // Create product mix rows
      const productMix: any[] = day.product_mix || []
      if (productMix.length > 0) {
        const mixRows = productMix.map((p: any) => {
          const matchedId = p.matched_menu_item
            ? menuItemByName.get(p.matched_menu_item.toLowerCase().trim()) || null
            : null
          return {
            restaurant_id: restaurantId,
            operation_id: opRow.id,
            menu_item_id: matchedId,
            item_name: p.item_name,
            quantity_sold: p.quantity_sold,
            unit_revenue: p.unit_revenue,
            total_revenue: p.total_revenue,
          }
        })
        await adminSupabase.from('daily_product_mix').insert(mixRows)
      }
    }

    const periodStart = days.length > 0 ? days[0].date : null
    const periodEnd = days.length > 0 ? days[days.length - 1].date : null

    await adminSupabase.from('operations_imports').update({
      status: 'review_required',
      ocr_confidence: extracted.confidence,
      extracted_data: extracted,
      period_start: periodStart,
      period_end: periodEnd,
      processed_at: new Date().toISOString(),
    }).eq('id', importId)

    return NextResponse.json({ importId, dayCount: days.length, confidence: extracted.confidence })
  } catch (e: any) {
    await adminSupabase.from('operations_imports').update({ status: 'failed' }).eq('id', importId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
