import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'

const CONFIDENCE_THRESHOLD = 70

function getClients() {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  return { anthropic, adminSupabase }
}

function normalize(name: string) {
  return name.trim().toUpperCase().replace(/\s+/g, ' ')
}

async function fileToBase64(url: string) {
  const res = await fetch(url)
  const buf = await res.arrayBuffer()
  return Buffer.from(buf).toString('base64')
}

export async function POST(req: Request) {
  const { anthropic, adminSupabase } = getClients()
  const { invoiceId } = await req.json()

  if (!invoiceId) {
    return NextResponse.json({ error: 'Missing invoiceId' }, { status: 400 })
  }

  const { data: invoice } = await adminSupabase
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .single()

  if (!invoice) {
    return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })
  }

  await adminSupabase.from('invoices').update({ status: 'processing' }).eq('id', invoiceId)

  try {
    const restaurantId = invoice.restaurant_id
    const isPdf = invoice.file_name?.toLowerCase().endsWith('.pdf')
    const mediaType = isPdf
      ? 'application/pdf'
      : invoice.file_name?.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'

    const { data: existingIngredients } = await adminSupabase
      .from('ingredients')
      .select('name, current_price, unit')
      .eq('restaurant_id', restaurantId)

    const ingredientContext = existingIngredients?.length
      ? `\nPrecios actuales en sistema:\n${existingIngredients.map(i => `- ${i.name}: $${i.current_price}/${i.unit}`).join('\n')}`
      : ''

    const prompt = `Analizá esta factura de proveedor gastronómico y extraé todos los datos en JSON.
${ingredientContext}

Respondé ÚNICAMENTE con JSON válido:
{
  "supplier_name": "nombre del proveedor",
  "supplier_tax_id": "CUIT o null",
  "invoice_number": "número de factura o null",
  "invoice_date": "YYYY-MM-DD o null",
  "due_date": "YYYY-MM-DD o null",
  "total_amount": número o null,
  "currency": "ARS",
  "confidence": número del 0 al 100,
  "items": [
    {
      "ingredient_name": "nombre del producto tal como aparece en la factura",
      "quantity": número o null,
      "unit": "kg/lt/un/etc o null",
      "unit_price": número o null,
      "total_price": número o null
    }
  ]
}`

    const base64 = await fileToBase64(invoice.file_url)
    const messageContent: any[] = []
    if (!isPdf) {
      messageContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } })
    } else {
      messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } })
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

    // 1. Supplier: match by tax_id, then by name, else create
    let supplierId: string | null = null
    if (extracted.supplier_name) {
      let supplier = null
      if (extracted.supplier_tax_id) {
        const { data } = await adminSupabase
          .from('suppliers')
          .select('id')
          .eq('restaurant_id', restaurantId)
          .eq('tax_id', extracted.supplier_tax_id)
          .maybeSingle()
        supplier = data
      }
      if (!supplier) {
        const { data } = await adminSupabase
          .from('suppliers')
          .select('id')
          .eq('restaurant_id', restaurantId)
          .ilike('name', extracted.supplier_name)
          .maybeSingle()
        supplier = data
      }
      if (!supplier) {
        const { data: created } = await adminSupabase
          .from('suppliers')
          .insert({
            restaurant_id: restaurantId,
            name: extracted.supplier_name,
            tax_id: extracted.supplier_tax_id || null,
            status: 'active',
          })
          .select('id')
          .single()
        supplier = created
      }
      supplierId = supplier?.id || null
    }

    // 2. Items: match/create ingredient, append alias, insert invoice_line, append price_history
    const items = extracted.items || []
    for (const item of items) {
      if (!item.ingredient_name) continue
      const normalizedName = normalize(item.ingredient_name)

      let { data: ingredient } = await adminSupabase
        .from('ingredients')
        .select('id, current_price, unit')
        .eq('restaurant_id', restaurantId)
        .eq('normalized_name', normalizedName)
        .maybeSingle()

      let ingredientId: string
      let previousPrice: number | null = null

      if (ingredient) {
        ingredientId = ingredient.id
        previousPrice = ingredient.current_price
        await adminSupabase
          .from('ingredients')
          .update({
            current_price: item.unit_price ?? ingredient.current_price,
            unit: item.unit || ingredient.unit,
            supplier_id: supplierId,
            last_updated: new Date().toISOString(),
          })
          .eq('id', ingredientId)
      } else {
        const { data: created } = await adminSupabase
          .from('ingredients')
          .insert({
            restaurant_id: restaurantId,
            name: item.ingredient_name,
            normalized_name: normalizedName,
            unit: item.unit || 'kg',
            current_price: item.unit_price || 0,
            supplier_id: supplierId,
            status: 'draft',
          })
          .select('id')
          .single()
        ingredientId = created!.id
      }

      // record the raw OCR text variant for normalization audit
      await adminSupabase.from('ingredient_aliases').insert({
        ingredient_id: ingredientId,
        raw_text: item.ingredient_name,
      })

      const priceChangePct = previousPrice && item.unit_price
        ? ((item.unit_price - previousPrice) / previousPrice) * 100
        : null

      await adminSupabase.from('invoice_lines').insert({
        invoice_id: invoiceId,
        ingredient_id: ingredientId,
        ingredient_name: item.ingredient_name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: item.unit_price,
        total_price: item.total_price,
        previous_price: previousPrice,
        price_change_pct: priceChangePct,
      })

      // append-only price history: only when price actually changed (or first time seen)
      if (item.unit_price != null && item.unit_price !== previousPrice) {
        await adminSupabase.from('price_history').insert({
          restaurant_id: restaurantId,
          ingredient_id: ingredientId,
          supplier_id: supplierId,
          invoice_id: invoiceId,
          price: item.unit_price,
          unit: item.unit || 'kg',
        })
      }
    }

    const finalStatus = extracted.confidence >= CONFIDENCE_THRESHOLD ? 'processed' : 'review_required'

    const { data: updatedInvoice } = await adminSupabase
      .from('invoices')
      .update({
        supplier_id: supplierId,
        supplier_name: extracted.supplier_name,
        supplier_cuit: extracted.supplier_tax_id,
        invoice_number: extracted.invoice_number,
        invoice_date: extracted.invoice_date,
        due_date: extracted.due_date,
        total_amount: extracted.total_amount,
        currency: extracted.currency || 'ARS',
        status: finalStatus,
        extracted_data: extracted,
        ocr_confidence: extracted.confidence,
        processed_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)
      .select()
      .single()

    return NextResponse.json({ invoice: updatedInvoice, ...extracted })
  } catch (e: any) {
    await adminSupabase.from('invoices').update({ status: 'failed' }).eq('id', invoiceId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
