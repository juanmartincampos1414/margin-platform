import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id } = await params

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('supplier_opportunities')
    .select('*, ingredients(name, unit)')
    .eq('restaurant_id', restaurantId)
    .eq('supplier_id', id)
    .order('impact_value', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data || [])
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id: supplierId } = await params

  const supabase = await createClient()
  const { opportunityId, status } = await req.json()
  if (!opportunityId || !status) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const now = new Date().toISOString()
  const timestamps: Record<string, string | null> = {
    updated_at: now,
    ...(status === 'reviewed' ? { reviewed_at: now } : {}),
    ...(status === 'dismissed' ? { dismissed_at: now } : {}),
  }

  const { data, error } = await supabase
    .from('supplier_opportunities')
    .update({ status, ...timestamps })
    .eq('id', opportunityId)
    .eq('supplier_id', supplierId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
