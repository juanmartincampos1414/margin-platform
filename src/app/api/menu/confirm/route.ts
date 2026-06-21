import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRestaurant } from '@/lib/auth'

// POST /api/menu/confirm — FR-030, CTA "Confirm Menu". Moves pending_review
// items to active. Body { itemIds?: string[] } — omit to confirm every
// pending_review item for the restaurant (e.g. confirming a whole import).
export async function POST(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const supabase = await createClient()
  const body = await req.json().catch(() => ({}))
  const { itemIds } = body as { itemIds?: string[] }

  let query = supabase
    .from('menu_items')
    .update({ status: 'active' })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'pending_review')

  if (itemIds?.length) query = query.in('id', itemIds)

  const { data, error } = await query.select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ confirmed: data?.length || 0, items: data })
}
