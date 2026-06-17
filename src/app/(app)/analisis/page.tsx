import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatPercent, getMarginColor } from '@/lib/utils'
import Link from 'next/link'

export default async function AnalisisPage() {
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
      id, name, sale_price, status,
      recipe_ingredients(
        quantity, unit,
        ingredients(price_per_unit, unit)
      )
    `)
    .eq('restaurant_id', profile?.restaurant_id)
    .eq('status', 'active')

  function calcCost(recipe: any): number {
    return (recipe.recipe_ingredients || []).reduce((s: number, ri: any) => {
      if (!ri.ingredients) return s
      const ratio = (ri.unit === 'gr' && ri.ingredients.unit === 'kg') ||
                    (ri.unit === 'ml' && ri.ingredients.unit === 'lt') ? 1000 : 1
      return s + (ri.quantity * ri.ingredients.price_per_unit / ratio)
    }, 0)
  }

  const analyzed = (recipes || []).map(r => {
    const cost = calcCost(r)
    const gross = r.sale_price > 0 ? ((r.sale_price - cost) / r.sale_price) * 100 : 0
    return { ...r, cost, gross }
  }).sort((a, b) => a.gross - b.gross)

  const avgMargin = analyzed.length ? analyzed.reduce((s, r) => s + r.gross, 0) / analyzed.length : 0
  const belowThreshold = analyzed.filter(r => r.gross < 35).length
  const excellent = analyzed.filter(r => r.gross >= 60).length

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Análisis de margen</h1>
        <p className="text-slate-500 mt-1">Rendimiento por plato de tu carta activa</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-slate-400 text-xs mb-1">Margen promedio</p>
          <p className={`text-3xl font-bold ${getMarginColor(avgMargin)}`}>{formatPercent(avgMargin)}</p>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <p className="text-red-500 text-xs mb-1">Platos críticos (&lt;35%)</p>
          <p className="text-3xl font-bold text-red-700">{belowThreshold}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <p className="text-emerald-600 text-xs mb-1">Platos excelentes (≥60%)</p>
          <p className="text-3xl font-bold text-emerald-700">{excellent}</p>
        </div>
      </div>

      {/* Ranked table */}
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-semibold text-slate-900">Ranking de márgenes</h2>
          <p className="text-slate-400 text-xs mt-0.5">Ordenado de menor a mayor margen bruto</p>
        </div>
        {analyzed.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">📊</p>
            <p className="text-slate-500 text-sm">No hay recetas activas para analizar.</p>
            <Link href="/recetas/nueva" className="text-indigo-600 text-sm hover:text-indigo-700 mt-2 inline-block">Crear receta →</Link>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">#</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Plato</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Precio venta</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Costo</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Margen bruto</th>
                <th className="px-4 py-3 text-slate-500 font-medium">Visual</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {analyzed.map((recipe, i) => (
                <tr key={recipe.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-400 font-medium">{i + 1}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{recipe.name}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(recipe.sale_price)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(recipe.cost)}</td>
                  <td className={`px-4 py-3 text-right font-bold ${getMarginColor(recipe.gross)}`}>{formatPercent(recipe.gross)}</td>
                  <td className="px-4 py-3">
                    <div className="w-full bg-slate-100 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${recipe.gross >= 60 ? 'bg-emerald-500' : recipe.gross >= 35 ? 'bg-yellow-400' : 'bg-red-500'}`}
                        style={{ width: `${Math.min(recipe.gross, 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/recetas/${recipe.id}`} className="text-indigo-600 hover:text-indigo-700 text-sm">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
