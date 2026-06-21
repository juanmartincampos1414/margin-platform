import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import IngredientsClient from './IngredientsClient'

export default async function IngredientsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('*, suppliers(id, name)')
    .eq('restaurant_id', profile?.restaurant_id)
    .neq('status', 'archived')
    .order('name')

  return <IngredientsClient ingredients={ingredients || []} restaurantId={profile?.restaurant_id} />
}
