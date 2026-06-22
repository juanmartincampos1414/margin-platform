import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const url = new URL(req.url)
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '10'), 10)

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('supplier_opportunities')
    .select('id, supplier_id, ingredient_id, title, price_change_pct, impact_value, created_at, suppliers(name), ingredients(name, unit)')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'open')
    .order('price_change_pct', { ascending: false })
    .limit(limit)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(
    (data || []).map((row: any) => ({
      id: row.id,
      supplier_id: row.supplier_id,
      supplier_name: row.suppliers?.name || '',
      ingredient_id: row.ingredient_id,
      ingredient_name: row.ingredients?.name || '',
      unit: row.ingredients?.unit || '',
      price_change_pct: Number(row.price_change_pct),
      impact_value: Number(row.impact_value),
      title: row.title,
      created_at: row.created_at,
    }))
  )
}
