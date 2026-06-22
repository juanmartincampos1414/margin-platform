import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// PATCH: mark a confirmed daily_operations row as voided.
// Hard Rule 5: never hard-delete — voided rows stay for audit.
// Only confirmed rows can be voided; drafts can simply be abandoned.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id } = await params

  const supabase = await createClient()

  const { data: op } = await supabase
    .from('daily_operations')
    .select('id, status')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!op) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (op.status !== 'confirmed') {
    return NextResponse.json({ error: 'Solo se pueden anular cierres confirmados' }, { status: 422 })
  }

  const { error } = await supabase
    .from('daily_operations')
    .update({ status: 'voided', updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
