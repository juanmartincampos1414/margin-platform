import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  if (!profile?.restaurant_id) return NextResponse.json({ error: 'No restaurant' }, { status: 400 })

  const { data: supplier, error } = await supabase
    .from('suppliers')
    .select('*, invoices(id, file_name, invoice_number, invoice_date, total_amount, status), ingredients(id, name, current_price, unit, status)')
    .eq('id', id)
    .eq('restaurant_id', profile.restaurant_id)
    .single()

  if (error || !supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

  const { data: priceHistory } = await supabase
    .from('price_history')
    .select('ingredient_id, price, recorded_at')
    .eq('supplier_id', id)
    .order('recorded_at', { ascending: true })

  const byIngredient: Record<string, { price: number }[]> = {}
  for (const row of priceHistory || []) {
    byIngredient[row.ingredient_id] ??= []
    byIngredient[row.ingredient_id].push({ price: Number(row.price) })
  }

  const pctChanges: number[] = []
  for (const points of Object.values(byIngredient)) {
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1].price
      if (prev > 0) pctChanges.push(((points[i].price - prev) / prev) * 100)
    }
  }
  const avgPriceVariation = pctChanges.length
    ? pctChanges.reduce((a, b) => a + b, 0) / pctChanges.length
    : 0

  const invoices = supplier.invoices || []
  const totalSpend = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0)
  const lastPurchase = invoices.map((inv: any) => inv.invoice_date).filter(Boolean).sort().reverse()[0] || null

  return NextResponse.json({
    id: supplier.id,
    name: supplier.name,
    tax_id: supplier.tax_id,
    phone: supplier.phone,
    email: supplier.email,
    payment_terms: supplier.payment_terms,
    credit_days: supplier.credit_days,
    status: supplier.status,
    total_spend: totalSpend,
    invoice_count: invoices.length,
    ingredient_count: (supplier.ingredients || []).length,
    last_purchase: lastPurchase,
    avg_price_variation: avgPriceVariation,
    invoices,
    ingredients: supplier.ingredients,
    price_history: priceHistory,
  })
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  if (!profile?.restaurant_id) return NextResponse.json({ error: 'No restaurant' }, { status: 400 })

  const body = await req.json()
  const { name, tax_id, phone, email, payment_terms, credit_days, status } = body

  const { data, error } = await supabase
    .from('suppliers')
    .update({ name, tax_id, phone, email, payment_terms, credit_days, status })
    .eq('id', id)
    .eq('restaurant_id', profile.restaurant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
