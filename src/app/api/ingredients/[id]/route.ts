import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  if (!profile?.restaurant_id) return NextResponse.json({ error: 'No restaurant' }, { status: 400 })

  // Soft delete only — historical integrity requires we never hard-delete
  // an ingredient. Existing recipes/invoices/price history keep resolving
  // correctly; it just disappears from active pickers and lists.
  const { data, error } = await supabase
    .from('ingredients')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('restaurant_id', profile.restaurant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  if (!profile?.restaurant_id) return NextResponse.json({ error: 'No restaurant' }, { status: 400 })

  const body = await req.json()
  const { name, normalized_name, category_id, unit, current_price, supplier_id, status } = body

  const payload: Record<string, unknown> = {}
  if (name !== undefined) payload.name = name
  if (normalized_name !== undefined) payload.normalized_name = normalized_name
  if (category_id !== undefined) payload.category_id = category_id
  if (unit !== undefined) payload.unit = unit
  if (current_price !== undefined) {
    payload.current_price = current_price
    // A manual price edit wins over any invoice already on file — only a
    // future-dated invoice should be able to override it after this point.
    payload.current_price_invoice_date = new Date().toISOString().slice(0, 10)
  }
  if (supplier_id !== undefined) payload.supplier_id = supplier_id
  if (status !== undefined) payload.status = status

  const { data, error } = await supabase
    .from('ingredients')
    .update(payload)
    .eq('id', id)
    .eq('restaurant_id', profile.restaurant_id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
