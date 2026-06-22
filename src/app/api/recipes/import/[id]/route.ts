import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id } = await params

  const supabase = await createClient()

  const [{ data: importRow }, { data: items }] = await Promise.all([
    supabase.from('recipe_imports').select('*').eq('id', id).eq('restaurant_id', restaurantId).single(),
    supabase.from('recipe_import_items').select('*, recipes!matched_recipe_id(id, name)').eq('import_id', id).eq('restaurant_id', restaurantId).order('created_at'),
  ])

  if (!importRow) return NextResponse.json({ error: 'Import not found' }, { status: 404 })
  return NextResponse.json({ ...importRow, items: items || [] })
}
