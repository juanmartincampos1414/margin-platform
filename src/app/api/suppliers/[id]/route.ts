import { requireRestaurant } from '@/lib/auth'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id } = await params

  const supabase = await createClient()

  const [{ data: supplier }, { data: invoices }, { data: phRows }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*, supplier_metrics(health_score, risk_level, monthly_variation_pct, updated_at)')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single(),
    supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total_amount, status')
      .eq('restaurant_id', restaurantId)
      .eq('supplier_id', id)
      .order('invoice_date', { ascending: false }),
    supabase
      .from('price_history')
      .select('ingredient_id, ingredients(id, name, current_price, unit)')
      .eq('restaurant_id', restaurantId)
      .eq('supplier_id', id),
  ])

  if (!supplier) return NextResponse.json({ error: 'Supplier not found' }, { status: 404 })

  const distinctIngredients = new Map<string, any>()
  for (const row of phRows || []) {
    if (!distinctIngredients.has(row.ingredient_id)) {
      distinctIngredients.set(row.ingredient_id, row.ingredients)
    }
  }

  const totalSpend = (invoices || []).reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0)
  const lastInvoice = invoices?.[0]?.invoice_date || null
  const metricsRow = Array.isArray(supplier.supplier_metrics)
    ? supplier.supplier_metrics[0]
    : supplier.supplier_metrics

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
    invoice_count: (invoices || []).length,
    ingredient_count: distinctIngredients.size,
    last_invoice: lastInvoice,
    invoices: invoices || [],
    ingredients: Array.from(distinctIngredients.values()),
    health_score: metricsRow?.health_score ?? null,
    risk_level: metricsRow?.risk_level ?? null,
    monthly_variation_pct: metricsRow?.monthly_variation_pct ?? null,
    metrics_updated_at: metricsRow?.updated_at ?? null,
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
