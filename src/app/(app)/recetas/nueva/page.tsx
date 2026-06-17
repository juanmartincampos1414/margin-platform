import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecipeForm from '@/components/recipes/RecipeForm'

export default async function NuevaRecetaPage() {
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
    .select('id, name, unit, price_per_unit, brand')
    .eq('restaurant_id', profile?.restaurant_id)
    .order('name')

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Nueva receta</h1>
        <p className="text-slate-500 mt-1">Creá un plato y calculá su costo y margen en tiempo real.</p>
      </div>
      <RecipeForm ingredients={ingredients || []} restaurantId={profile?.restaurant_id} />
    </div>
  )
}
