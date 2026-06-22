import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id } = await params

  const url = new URL(req.url)
  const ingredientId = url.searchParams.get('ingredient_id')

  const supabase = await createClient()

  let query = supabase
    .from('price_history')
    .select('id, ingredient_id, price, unit, recorded_at, invoices(invoice_date), ingredients(id, name, unit)')
    .eq('restaurant_id', restaurantId)
    .eq('supplier_id', id)
    .order('recorded_at', { ascending: true })

  if (ingredientId) query = query.eq('ingredient_id', ingredientId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (data || []).map((row: any) => ({
      id: row.id,
      ingredient_id: row.ingredient_id,
      ingredient_name: row.ingredients?.name || '',
      price: Number(row.price),
      unit: row.unit,
      invoice_date: row.invoices?.invoice_date || null,
      recorded_at: row.recorded_at,
    }))
  )
}
