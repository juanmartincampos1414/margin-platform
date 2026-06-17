import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: Request) {
  const adminSupabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { restaurantName, userId, email } = await req.json()

  const { data: restaurant, error: restError } = await adminSupabase
    .from('restaurants')
    .insert({ name: restaurantName, owner_email: email, plan: 'trial' })
    .select()
    .single()

  if (restError) return NextResponse.json({ error: restError.message }, { status: 500 })

  const { error: profileError } = await adminSupabase
    .from('profiles')
    .update({ restaurant_id: restaurant.id, role: 'owner' })
    .eq('id', userId)

  if (profileError) return NextResponse.json({ error: profileError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
