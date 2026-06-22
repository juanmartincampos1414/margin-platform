import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurant } from '@/lib/auth'
import { normalizeIngredientName } from '@/lib/utils'
import { recomputeSupplierIntelligence } from '@/lib/suppliers'

const CONFIDENCE_THRESHOLD = 70

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

  // The invoice must belong to the caller's own restaurant — never trust
  // invoiceId alone, since the admin client below bypasses RLS.
  if (invoice.restaurant_id !== restaurantId) {
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

IMPORTANTE sobre paquetes/cajones/cajas/bultos: muchas líneas de factura facturan un paquete completo, no una unidad suelta (ej: "1 cajón x 10 unidades — $5.200", "Caja x 6 — $3.600"). Para esas líneas:
- "unit" es siempre la unidad BASE del producto (kg/lt/un/etc) — NUNCA "cajón", "caja", "bulto" o "display", esas son unidades de empaque, no la unidad base.
- "units_per_pack" es cuántas unidades base hay en cada paquete (ej: "cajón x 10" → 10). Si el producto se vende unitario sin empaque, usar 1.
- "pack_price" es el precio del paquete/cajón/caja completo tal como figura impreso en la factura — NUNCA lo dividas vos, dejá ese cálculo para después.
Ejemplo: "1 cajón x 10 unidades — $5.200" → quantity=1, unit="un", units_per_pack=10, pack_price=5200.

OJO: el tamaño del paquete a veces viene escrito dentro del propio nombre del producto, no como una anotación separada (ej: "Agua con gas 0.5L Vidrio x12" facturado a $5.200 significa un paquete de 12 unidades a $5.200 el paquete, NO una unidad a $5.200). Si el nombre del producto termina en "xN", tratá esa N como units_per_pack salvo que el producto explícitamente se venda unitario.

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
      "quantity": número de paquetes/cajones/bultos facturados, o null,
      "unit": "unidad base: kg/lt/un/etc",
      "units_per_pack": número (1 si no hay empaque),
      "pack_price": número (precio del paquete completo, o precio unitario si no hay empaque),
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
      const normalizedName = normalizeIngredientName(item.ingredient_name)

      // unit_price must always be the price per BASE unit. pack_price is
      // what's literally printed on the invoice (e.g. $5,200 for a case of
      // 10) — it must never be stored as-is as the per-unit price.
      let unitsPerPack = item.units_per_pack && item.units_per_pack > 0 ? item.units_per_pack : 1

      // Deterministic safety net: some suppliers print the pack size as
      // part of the product name itself (e.g. "Agua con gas 0.5L Vidrio
      // x12") rather than as a separate "cajón x10" annotation. The OCR
      // prompt can miss this, so re-check the name directly instead of
      // relying solely on the model — this never fires when the model
      // already detected a pack (unitsPerPack > 1).
      if (unitsPerPack === 1) {
        // Must be its own whitespace-delimited token (e.g. "Vidrio x12")
        // — not glued to another word or number. A bare trailing
        // /x\d+$/ also matches dimension notation like "48x58" or
        // "60X70" (cm measurements on textiles/cloths), which is not a
        // pack size at all. Requiring "xN" to be the entire last token
        // rules that out; the tradeoff is that a pack size glued to a
        // preceding number (e.g. "350X24") won't be caught here — that's
        // an acceptable false negative (data stays as-is) vs. the
        // alternative of silently corrupting a real price (false positive).
        const tokens = item.ingredient_name.trim().split(/\s+/)
        const lastToken = tokens[tokens.length - 1]
        const packInName = lastToken.match(/^x(\d{1,3})$/i)
        const detectedPack = packInName ? parseInt(packInName[1], 10) : null
        if (detectedPack && detectedPack > 1) unitsPerPack = detectedPack
      }

      const packPrice = item.pack_price ?? null
      const unitPrice = packPrice != null ? packPrice / unitsPerPack : null

      // expose the computed per-unit price on the item so the upload
      // preview/response can show "$520/un (de $5.200 el paquete x10)"
      item.unit_price = unitPrice
      item.units_per_pack = unitsPerPack
      item.pack_price = packPrice

      let { data: ingredient } = await adminSupabase
        .from('ingredients')
        .select('id, current_price, current_price_invoice_date, unit')
        .eq('restaurant_id', restaurantId)
        .eq('normalized_name', normalizedName)
        .maybeSingle()

      let ingredientId: string
      let previousPrice: number | null = null

      if (ingredient) {
        ingredientId = ingredient.id
        previousPrice = ingredient.current_price

        // current_price must reflect the most recent invoice_date, not
        // upload/processing order. Only update it when this invoice's date
        // is strictly newer than whatever invoice currently backs the price.
        // A missing invoice_date never counts as "newer" — it's recorded in
        // price_history/invoice_lines below regardless, just never promoted
        // to current_price.
        const newDate = extracted.invoice_date ? new Date(extracted.invoice_date) : null
        const currentDate = ingredient.current_price_invoice_date ? new Date(ingredient.current_price_invoice_date) : null
        const shouldUpdateCurrentPrice =
          unitPrice != null && newDate && (!currentDate || newDate > currentDate)

        await adminSupabase
          .from('ingredients')
          .update({
            ...(shouldUpdateCurrentPrice
              ? { current_price: unitPrice, current_price_invoice_date: extracted.invoice_date }
              : {}),
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
            current_price: unitPrice || 0,
            current_price_invoice_date: extracted.invoice_date || null,
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

      const priceChangePct = previousPrice && unitPrice
        ? ((unitPrice - previousPrice) / previousPrice) * 100
        : null

      await adminSupabase.from('invoice_lines').insert({
        invoice_id: invoiceId,
        ingredient_id: ingredientId,
        ingredient_name: item.ingredient_name,
        quantity: item.quantity,
        unit: item.unit,
        unit_price: unitPrice,
        pack_price: packPrice,
        units_per_pack: unitsPerPack,
        total_price: item.total_price,
        previous_price: previousPrice,
        price_change_pct: priceChangePct,
      })

      // append-only price history: only when price actually changed (or first time seen)
      if (unitPrice != null && unitPrice !== previousPrice) {
        await adminSupabase.from('price_history').insert({
          restaurant_id: restaurantId,
          ingredient_id: ingredientId,
          supplier_id: supplierId,
          invoice_id: invoiceId,
          price: unitPrice,
          unit: item.unit || 'kg',
        })
      }
    }

    // Recompute supplier metrics synchronously — same place current_price
    // already updates inline, no separate job needed for an MVP score.
    if (supplierId) {
      await recomputeSupplierIntelligence(adminSupabase, restaurantId, supplierId)
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

    // Recompute supplier intelligence synchronously — same place
    // current_price already updates, no separate job needed.
    if (supplierId) {
      try {
        await recomputeSupplierIntelligence(adminSupabase, restaurantId, supplierId)
      } catch {
        // Never let a metrics failure block the invoice response.
      }
    }

    return NextResponse.json({ invoice: updatedInvoice, ...extracted })
  } catch (e: any) {
    await adminSupabase.from('invoices').update({ status: 'failed' }).eq('id', invoiceId)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
