import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRestaurant } from '@/lib/auth'

// GET /api/menu/import/:id — consultar estado de procesamiento.
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('menu_imports')
    .select('*')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .single()

  if (error) return NextResponse.json({ error: 'Menu import not found' }, { status: 404 })
  return NextResponse.json(data)
}
