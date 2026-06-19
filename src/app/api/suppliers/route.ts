import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  if (!profile?.restaurant_id) return NextResponse.json({ error: 'No restaurant' }, { status: 400 })

  const { data: suppliers, error } = await supabase
    .from('suppliers')
    .select('*, invoices(id, total_amount, invoice_date), ingredients(id)')
    .eq('restaurant_id', profile.restaurant_id)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = suppliers.map(s => {
    const invoices = s.invoices || []
    const totalSpend = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0)
    const lastPurchase = invoices
      .map((inv: any) => inv.invoice_date)
      .filter(Boolean)
      .sort()
      .reverse()[0] || null

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
      ingredient_count: (s.ingredients || []).length,
      last_purchase: lastPurchase,
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
