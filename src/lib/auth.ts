import { createClient } from '@/lib/supabase/server'

/**
 * Resolves the authenticated user's restaurant from their session.
 * Every mutating API route must use this instead of trusting a
 * client-supplied restaurantId — restaurant_id must always come from
 * the server-verified session, never from request body/query params.
 */
export async function requireRestaurant() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const, status: 401 as const }

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  if (!profile?.restaurant_id) return { error: 'No restaurant' as const, status: 400 as const }

  return { user, restaurantId: profile.restaurant_id as string }
}

export async function requireUser() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized' as const, status: 401 as const }
  return { user }
}
