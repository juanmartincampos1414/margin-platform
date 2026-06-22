import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

// Soft-delete: only allowed for invoices in a terminal error state.
// Processed invoices and their price_history are permanent (Hard Rule 5).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id } = await params

  const supabase = await createClient()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  if (!['failed', 'review_required', 'uploaded'].includes(invoice.status)) {
    return NextResponse.json(
      { error: 'Solo se pueden eliminar facturas fallidas o pendientes de revisión' },
      { status: 422 }
    )
  }

  const { error } = await supabase
    .from('invoices')
    .update({ status: 'deleted' })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
