import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatPercent, getMarginColor } from '@/lib/utils'

export default async function RecetasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: recipes } = await supabase
    .from('recipes')
    .select(`
      id, name, sale_price, status, tags, image_url,
      recipe_ingredients(
        quantity, unit,
        ingredients(current_price, unit)
      )
    `)
    .eq('restaurant_id', profile?.restaurant_id)
    .order('created_at', { ascending: false })

  function calcCost(recipe: any) {
    return (recipe.recipe_ingredients || []).reduce((sum: number, ri: any) => {
      if (!ri.ingredients) return sum
      const ratio = (ri.unit === 'gr' && ri.ingredients.unit === 'kg') ||
                    (ri.unit === 'ml' && ri.ingredients.unit === 'lt') ? 1000 : 1
      return sum + (ri.quantity * ri.ingredients.current_price / ratio)
    }, 0)
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Recetas</h1>
          <p className="text-slate-500 mt-1">{recipes?.length || 0} platos registrados</p>
        </div>
        <Link href="/recetas/nueva" className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          + Nueva receta
        </Link>
      </div>

      {(!recipes || recipes.length === 0) ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <p className="text-5xl mb-4">🍽</p>
          <h3 className="font-semibold text-slate-900 mb-2">No hay recetas aún</h3>
          <p className="text-slate-500 text-sm mb-6">Creá tu primera receta para calcular costos y márgenes.</p>
          <Link href="/recetas/nueva" className="bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors">
            Crear primera receta
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {recipes.map(recipe => {
            const cost = calcCost(recipe)
            const grossMargin = recipe.sale_price > 0 ? ((recipe.sale_price - cost) / recipe.sale_price) * 100 : 0

            return (
              <Link key={recipe.id} href={`/recetas/${recipe.id}`} className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all block">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-slate-900">{recipe.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${recipe.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                    {recipe.status === 'active' ? 'Activo' : 'Inactivo'}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3 mt-4">
                  <div>
                    <p className="text-slate-400 text-xs mb-0.5">Precio</p>
                    <p className="font-semibold text-slate-800 text-sm">{formatCurrency(recipe.sale_price)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs mb-0.5">Costo</p>
                    <p className="font-semibold text-slate-800 text-sm">{formatCurrency(cost)}</p>
                  </div>
                  <div>
                    <p className="text-slate-400 text-xs mb-0.5">Margen</p>
                    <p className={`font-bold text-sm ${getMarginColor(grossMargin)}`}>{formatPercent(grossMargin)}</p>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
