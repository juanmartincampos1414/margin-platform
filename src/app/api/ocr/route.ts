import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

function getClients() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return { anthropic, adminSupabase }
}

export async function POST(req: Request) {
  const { anthropic, adminSupabase } = getClients()
  const formData = await req.formData()
  const file = formData.get('file') as File
  const restaurantId = formData.get('restaurantId') as string

  if (!file || !restaurantId) {
    return NextResponse.json({ error: 'Missing file or restaurantId' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')
  const mediaType = file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

  const isPdf = file.type === 'application/pdf'

  try {
    // Upload to Supabase Storage
    const fileName = `${restaurantId}/${Date.now()}_${file.name}`
    const { data: uploadData } = await adminSupabase.storage
      .from('invoices')
      .upload(fileName, bytes, { contentType: file.type })

    const { data: { publicUrl } } = adminSupabase.storage.from('invoices').getPublicUrl(fileName)

    // Get existing ingredient prices for comparison
    const { data: ingredients } = await adminSupabase
      .from('ingredients')
      .select('name, price_per_unit, unit')
      .eq('restaurant_id', restaurantId)

    const ingredientContext = ingredients?.length
      ? `\nPrecios actuales en sistema:\n${ingredients.map(i => `- ${i.name}: $${i.price_per_unit}/${i.unit}`).join('\n')}`
      : ''

    const prompt = `Analizá esta factura de proveedor gastronómico y extraé todos los datos en JSON.
${ingredientContext}

Respondé ÚNICAMENTE con JSON válido:
{
  "supplier_name": "nombre del proveedor",
  "supplier_cuit": "XX-XXXXXXXX-X o null",
  "invoice_number": "número de factura o null",
  "invoice_date": "YYYY-MM-DD o null",
  "total_amount": número o null,
  "currency": "ARS",
  "confidence": número del 0 al 100,
  "items": [
    {
      "product_name": "nombre del producto",
      "quantity": número o null,
      "unit": "kg/lt/un/etc o null",
      "unit_price": número o null,
      "subtotal": número o null,
      "price_change_pct": diferencia % respecto al precio en sistema (positivo=subió, null si no hay referencia)
    }
  ]
}`

    const messageContent: any[] = []

    if (!isPdf) {
      messageContent.push({
        type: 'image',
        source: { type: 'base64', media_type: mediaType, data: base64 },
      })
    }
    messageContent.push({ type: 'text', text: prompt })

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 2048,
      messages: [{ role: 'user', content: messageContent }],
    })

    const text = (message.content[0] as any).text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('No JSON in OCR response')

    const extracted = JSON.parse(jsonMatch[0])

    // Save invoice to DB
    const { data: invoice } = await adminSupabase
      .from('invoices')
      .insert({
        restaurant_id: restaurantId,
        file_url: publicUrl,
        file_name: file.name,
        supplier_name: extracted.supplier_name,
        supplier_cuit: extracted.supplier_cuit,
        invoice_number: extracted.invoice_number,
        invoice_date: extracted.invoice_date,
        total_amount: extracted.total_amount,
        currency: extracted.currency || 'ARS',
        status: 'processed',
        extracted_data: extracted,
        ocr_confidence: extracted.confidence,
        processed_at: new Date().toISOString(),
      })
      .select()
      .single()

    // Save invoice items
    if (invoice && extracted.items?.length > 0) {
      await adminSupabase.from('invoice_items').insert(
        extracted.items.map((item: any) => ({
          invoice_id: invoice.id,
          product_name: item.product_name,
          quantity: item.quantity,
          unit: item.unit,
          unit_price: item.unit_price,
          subtotal: item.subtotal,
          price_change_pct: item.price_change_pct,
        }))
      )
    }

    return NextResponse.json({ ...extracted, invoiceId: invoice?.id })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
