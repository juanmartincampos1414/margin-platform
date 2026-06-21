import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  if (!profile?.restaurant_id) return NextResponse.json({ error: 'No restaurant' }, { status: 400 })

  const { data, error } = await supabase
    .from('ingredients')
    .select('*, suppliers(id, name)')
    .eq('restaurant_id', profile.restaurant_id)
    .neq('status', 'archived')
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
