import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RecipeForm from '@/components/recipes/RecipeForm'

export default async function EditarRecetaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: recipe } = await supabase
    .from('recipes')
    .select(`
      id, name, sale_price, servings, status,
      recipe_ingredients(
        id, quantity, unit, ingredient_id,
        ingredients(id, name, current_price, unit, brand)
      )
    `)
    .eq('id', id)
    .eq('restaurant_id', profile?.restaurant_id)
    .single()

  if (!recipe) notFound()

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_price, brand')
    .eq('restaurant_id', profile?.restaurant_id)
    .neq('status', 'archived')
    .order('name')

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Editar receta</h1>
        <p className="text-slate-500 mt-1">{recipe.name}</p>
      </div>
      <RecipeForm ingredients={ingredients || []} restaurantId={profile?.restaurant_id} recipe={recipe} />
    </div>
  )
}
