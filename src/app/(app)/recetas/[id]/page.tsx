import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatPercent, getMarginColor, getMarginBg } from '@/lib/utils'
import { calculateLineCost, calculateRecipeCost } from '@/lib/recipes'
import RecipeAI from '@/components/recipes/RecipeAI'

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
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
      id, name, sale_price, status, servings, description, tags,
      recipe_ingredients(
        id, quantity, unit,
        ingredients(id, name, current_price, unit, brand)
      )
    `)
    .eq('id', id)
    .eq('restaurant_id', profile?.restaurant_id)
    .single()

  if (!recipe) notFound()

  const calcLineCost = calculateLineCost
  const totalCost = calculateRecipeCost(recipe.recipe_ingredients)
  const grossMargin = recipe.sale_price > 0 ? ((recipe.sale_price - totalCost) / recipe.sale_price) * 100 : 0
  const netMargin = grossMargin * 0.7 // rough estimate

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-start justify-between mb-8">
        <div>
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
            <Link href="/recetas" className="hover:text-slate-600">Recetas</Link>
            <span>›</span>
            <span className="text-slate-600">{recipe.name}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">{recipe.name}</h1>
          <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${recipe.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
            {recipe.status === 'active' ? 'Activo' : 'Inactivo'}
          </span>
        </div>
        <Link href={`/recetas/${id}/editar`} className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          Editar
        </Link>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Precio de venta', value: formatCurrency(recipe.sale_price) },
          { label: 'Costo de receta', value: formatCurrency(totalCost) },
          { label: 'Margen bruto', value: formatPercent(grossMargin), color: getMarginColor(grossMargin) },
          { label: 'Margen neto est.', value: formatPercent(netMargin), color: getMarginColor(netMargin) },
        ].map(kpi => (
          <div key={kpi.label} className={`bg-white border rounded-2xl p-5 ${kpi.color ? getMarginBg(grossMargin) : 'border-slate-200'}`}>
            <p className="text-slate-400 text-xs mb-1">{kpi.label}</p>
            <p className={`text-2xl font-bold ${kpi.color || 'text-slate-900'}`}>{kpi.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ingredient table */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Composición de costo</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  <th className="text-left pb-3 text-slate-400 font-medium">Ingrediente</th>
                  <th className="text-right pb-3 text-slate-400 font-medium">Cantidad</th>
                  <th className="text-right pb-3 text-slate-400 font-medium">Costo unit.</th>
                  <th className="text-right pb-3 text-slate-400 font-medium">Costo total</th>
                  <th className="text-right pb-3 text-slate-400 font-medium">% costo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(recipe.recipe_ingredients || []).map((ri: any) => {
                  const cost = calcLineCost(ri)
                  const pct = totalCost > 0 ? (cost / totalCost) * 100 : 0
                  return (
                    <tr key={ri.id} className="hover:bg-slate-50">
                      <td className="py-3 text-slate-800 font-medium">
                        {ri.ingredients?.name}
                        {ri.ingredients?.brand && <span className="text-slate-400 text-xs ml-1">· {ri.ingredients.brand}</span>}
                      </td>
                      <td className="py-3 text-right text-slate-600">{ri.quantity} {ri.unit}</td>
                      <td className="py-3 text-right text-slate-600">{formatCurrency(ri.ingredients?.current_price || 0)}/{ri.ingredients?.unit}</td>
                      <td className="py-3 text-right font-semibold text-slate-800">{formatCurrency(cost)}</td>
                      <td className="py-3 text-right">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${pct > 40 ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                          {pct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200">
                  <td className="pt-3 font-bold text-slate-900" colSpan={3}>COSTO TOTAL</td>
                  <td className="pt-3 text-right font-bold text-slate-900">{formatCurrency(totalCost)}</td>
                  <td className="pt-3 text-right font-bold text-slate-900">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* AI Recommendations */}
        <div>
          <RecipeAI
            recipeId={recipe.id}
            recipeName={recipe.name}
            totalCost={totalCost}
            salePrice={recipe.sale_price}
            grossMargin={grossMargin}
            ingredients={(recipe.recipe_ingredients || []).map((ri: any) => ({
              name: ri.ingredients?.name,
              cost: calcLineCost(ri),
              pct: totalCost > 0 ? (calcLineCost(ri) / totalCost) * 100 : 0,
            }))}
          />
        </div>
      </div>
    </div>
  )
}
