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

// Executive KPI contract — intentionally compact to avoid JSON truncation.
// Full product_mix replaced by top_sellers (max 10) — enough for Executive Intelligence
// without generating multi-thousand-token arrays.
const PROMPT = `Analizá este documento de cierre de caja o reporte de ventas.
Extraé un resumen ejecutivo de KPIs operativos. Si el documento cubre múltiples días, extraé cada uno por separado.

Respondé ÚNICAMENTE con este JSON válido (todos los valores numéricos sin formato, sin puntos ni comas de miles):
{
  "confidence": número 0-100,
  "period_start": "YYYY-MM-DD",
  "period_end": "YYYY-MM-DD",
  "days": [
    {
      "date": "YYYY-MM-DD",
      "total_revenue": número o null,
      "transactions": número entero o null,
      "total_covers": número entero o null,
      "avg_ticket": número o null,
      "avg_cover": número o null,
      "salon_sales": número o null,
      "delivery_sales": número o null,
      "cash_amount": número o null,
      "card_amount": número o null,
      "transfer_amount": número o null,
      "other_payment_amount": número o null,
      "complimentary_amount": número o null,
      "credit_notes_amount": número o null,
      "cancellations_amount": número o null,
      "top_sellers": [
        { "name": "nombre del producto", "quantity": número entero o null, "revenue": número o null }
      ]
    }
  ]
}

Reglas:
- top_sellers: máximo 10 productos, ordenados por revenue descendente
- Todos los montos en la moneda del documento, sin formato (1234.56 no 1.234,56)
- Si un campo no aparece en el documento, poné null
- No agregues campos extra fuera de este schema`

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
    messageContent.push({ type: 'text', text: PROMPT })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
      messages: [{ role: 'user', content: messageContent }],
    })

    const text = (message.content[0] as any).text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in OCR response')

    let raw = jsonMatch[0]
    raw = raw.replace(/,(\s*[\]}])/g, '$1')  // strip trailing commas

    let extracted: any
    try {
      extracted = JSON.parse(raw)
    } catch (parseErr: any) {
      console.error('[operations/process] JSON parse failed. stop_reason:', message.stop_reason, '| raw length:', raw.length)
      console.error('[operations/process] raw tail:', raw.slice(-400))
      throw new Error(`JSON parse error: ${parseErr.message} (stop_reason: ${message.stop_reason})`)
    }

    const days = extracted.days || []

    for (const day of days) {
      // Compute avg_cover server-side if not in response but we have the data
      const avgCover = day.avg_cover ?? (
        day.total_revenue && day.total_covers && day.total_covers > 0
          ? Math.round((day.total_revenue / day.total_covers) * 100) / 100
          : null
      )

      const { data: opRow } = await adminSupabase
        .from('daily_operations')
        .insert({
          restaurant_id: restaurantId,
          import_id: importId,
          operation_date: day.date,
          total_revenue: day.total_revenue,
          transactions: day.transactions,
          total_covers: day.total_covers,
          avg_ticket: day.avg_ticket,
          avg_cover: avgCover,
          salon_sales: day.salon_sales,
          delivery_sales: day.delivery_sales,
          cash_amount: day.cash_amount,
          card_amount: day.card_amount,
          transfer_amount: day.transfer_amount,
          other_payment_amount: day.other_payment_amount,
          complimentary_amount: day.complimentary_amount,
          credit_notes_amount: day.credit_notes_amount,
          cancellations_amount: day.cancellations_amount,
          status: 'draft',
        })
        .select('id')
        .single()

      if (!opRow) continue

      // Store top_sellers in daily_product_mix (same table, simpler data)
      const topSellers: any[] = day.top_sellers || []
      if (topSellers.length > 0) {
        const mixRows = topSellers.slice(0, 10).map((p: any) => ({
          restaurant_id: restaurantId,
          operation_id: opRow.id,
          menu_item_id: null,  // matching deferred — not needed for Executive Intelligence
          item_name: p.name,
          quantity_sold: p.quantity,
          unit_revenue: null,
          total_revenue: p.revenue,
        }))
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
