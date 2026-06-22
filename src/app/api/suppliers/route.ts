import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  if (!profile?.restaurant_id) return NextResponse.json({ error: 'No restaurant' }, { status: 400 })

  const [{ data: suppliers, error }, { data: phRows }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*, invoices(id, total_amount, invoice_date), supplier_metrics(health_score, risk_level, monthly_variation_pct)')
      .eq('restaurant_id', profile.restaurant_id)
      .order('name'),
    supabase
      .from('price_history')
      .select('supplier_id, ingredient_id')
      .eq('restaurant_id', profile.restaurant_id),
  ])

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ingredientsBySupplier = new Map<string, Set<string>>()
  for (const row of phRows || []) {
    if (!row.supplier_id) continue
    if (!ingredientsBySupplier.has(row.supplier_id)) ingredientsBySupplier.set(row.supplier_id, new Set())
    ingredientsBySupplier.get(row.supplier_id)!.add(row.ingredient_id)
  }

  const result = (suppliers || []).map((s: any) => {
    const invoices = s.invoices || []
    const totalSpend = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0)
    const lastPurchase = invoices.map((inv: any) => inv.invoice_date).filter(Boolean).sort().reverse()[0] || null
    const metricsRaw = Array.isArray(s.supplier_metrics) ? s.supplier_metrics[0] : s.supplier_metrics

    return {
      id: s.id,
      name: s.name,
      tax_id: s.tax_id,
      phone: s.phone,
      email: s.email,
      payment_terms: s.payment_terms,
      credit_days: s.credit_days,
      status: s.status,
      total_spend: totalSpend,
      invoice_count: invoices.length,
      ingredient_count: ingredientsBySupplier.get(s.id)?.size || 0,
      last_purchase: lastPurchase,
      health_score: metricsRaw?.health_score ?? null,
      risk_level: metricsRaw?.risk_level ?? null,
      monthly_variation_pct: metricsRaw?.monthly_variation_pct ?? null,
    }
  })

  return NextResponse.json(result)
}

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  if (!profile?.restaurant_id) return NextResponse.json({ error: 'No restaurant' }, { status: 400 })

  const body = await req.json()
  const { name, tax_id, phone, email, payment_terms, credit_days } = body
  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  const { data, error } = await supabase
    .from('suppliers')
    .insert({ restaurant_id: profile.restaurant_id, name, tax_id, phone, email, payment_terms, credit_days })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
