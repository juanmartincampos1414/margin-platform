import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRestaurant } from '@/lib/auth'

export async function POST(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const supabase = await createClient()
  const body = await req.json()
  const { name, brand, unit, current_price, stock_level, category_id, supplier_id } = body

  if (!name) return NextResponse.json({ error: 'Missing name' }, { status: 400 })

  const { data, error } = await supabase
    .from('ingredients')
    .insert({
      restaurant_id: restaurantId,
      name,
      brand: brand || null,
      unit: unit || 'kg',
      current_price: current_price || 0,
      // A manually entered price is a deliberate, final value — it must
      // never be silently overwritten by an invoice already on file.
      // Only a future-dated invoice can override it after this point,
      // same rule as the PATCH /api/ingredients/[id] manual-edit path.
      current_price_invoice_date: new Date().toISOString().slice(0, 10),
      stock_level: stock_level || 'medium',
      category_id: category_id || null,
      supplier_id: supplier_id || null,
      status: 'validated',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  if (!profile?.restaurant_id) return NextResponse.json({ error: 'No restaurant' }, { status: 400 })

  const { data, error } = await supabase
    .from('ingredients')
    .select('*, suppliers(id, name)')
    .eq('restaurant_id', profile.restaurant_id)
    .neq('status', 'archived')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
