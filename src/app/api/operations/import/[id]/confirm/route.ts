import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST: confirm the import — transitions draft daily_operations to confirmed.
// If a confirmed row already exists for that day, the previous one is superseded.
// Hard Rule 5: superseded rows are never deleted.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id: importId } = await params

  const supabase = await createClient()
  const adminSupabase = getAdminClient()

  const { data: importRow } = await supabase
    .from('operations_imports')
    .select('*')
    .eq('id', importId)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!importRow) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  const { data: draftOps } = await supabase
    .from('daily_operations')
    .select('id, operation_date, shift')
    .eq('import_id', importId)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'draft')

  if (!draftOps || draftOps.length === 0) {
    return NextResponse.json({ error: 'No draft operations to confirm' }, { status: 400 })
  }

  const confirmed: string[] = []

  for (const op of draftOps) {
    // Supersede any existing confirmed row for the same date+shift.
    // AM and PM on the same day are independent — they do NOT supersede each other.
    await adminSupabase
      .from('daily_operations')
      .update({ status: 'superseded', updated_at: new Date().toISOString() })
      .eq('restaurant_id', restaurantId)
      .eq('operation_date', op.operation_date)
      .eq('shift', op.shift)
      .eq('status', 'confirmed')
      .neq('id', op.id)

    // Confirm this row
    await adminSupabase
      .from('daily_operations')
      .update({ status: 'confirmed', updated_at: new Date().toISOString() })
      .eq('id', op.id)
      .eq('restaurant_id', restaurantId)

    confirmed.push(op.id)
  }

  await adminSupabase
    .from('operations_imports')
    .update({ status: 'confirmed' })
    .eq('id', importId)

  return NextResponse.json({ confirmed: confirmed.length, operation_ids: confirmed })
}
