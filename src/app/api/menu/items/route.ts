import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRestaurant } from '@/lib/auth'

function isDuplicatePair(a: string, b: string) {
  if (a === b) return true
  return a.startsWith(b) || b.startsWith(a)
}

// GET /api/menu/items — listar productos. Optional ?status= filter
// (e.g. ?status=pending_review for the Review screen).
export async function GET(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status')

  const supabase = await createClient()
  let query = supabase
    .from('menu_items')
    .select('*, menu_categories(id, name), recipes(id, name)')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'archived')
    .order('name')

  if (status) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // FR-033 Duplicate Detection — attach possible_duplicate_ids to each item.
  const duplicateIds: Record<string, string[]> = {}
  for (const item of data || []) {
    for (const other of data || []) {
      if (item.id === other.id) continue
      if (isDuplicatePair(item.normalized_name, other.normalized_name)) {
        duplicateIds[item.id] = duplicateIds[item.id] || []
        duplicateIds[item.id].push(other.id)
      }
    }
  }

  const withDuplicates = (data || []).map(item => ({
    ...item,
    possible_duplicate_ids: duplicateIds[item.id] || [],
  }))

  return NextResponse.json(withDuplicates)
}
