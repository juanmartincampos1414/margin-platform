import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id } = await params

  const { status } = await req.json()
  if (!['reviewed', 'dismissed'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_recommendations')
    .update({ status, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
