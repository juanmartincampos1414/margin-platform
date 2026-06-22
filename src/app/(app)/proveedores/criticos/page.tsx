import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

// FR-043 Critical Product Detection: only considers ingredients used in
// recipes linked to active menu items (per blueprint architecture decision).
// A high-priced ingredient in an orphaned recipe is NOT economically critical.
export default async function CriticalProductsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  const restaurantId = profile?.restaurant_id

  // Active menu item recipe IDs
  const { data: activeMenuItems } = await supabase
    .from('menu_items')
    .select('recipe_id')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .not('recipe_id', 'is', null)

  const activeRecipeIds = (activeMenuItems || []).map(i => i.recipe_id).filter(Boolean) as string[]

  // Ingredients used in those recipes
  const { data: recipeIngredients } = activeRecipeIds.length > 0
    ? await supabase
        .from('recipe_ingredients')
        .select('ingredient_id, quantity, unit')
        .in('recipe_id', activeRecipeIds)
    : { data: [] }

  const activeIngredientIds = [...new Set((recipeIngredients || []).map(ri => ri.ingredient_id))]

  if (activeIngredientIds.length === 0) {
    return (
      <div className="p-8">
        <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
          <Link href="/proveedores" className="hover:text-slate-600">Supplier Intelligence</Link>
          <span>›</span>
          <span className="text-slate-600">Productos Críticos</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Productos Críticos</h1>
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center mt-6">
          <p className="text-4xl mb-3">🍽</p>
          <p className="text-slate-600 font-medium">Sin datos suficientes</p>
          <p className="text-slate-400 text-sm mt-1">Vinculá recetas a tus platos del menú para que Margin pueda identificar los ingredientes críticos para tu rentabilidad.</p>
          <Link href="/menu" className="inline-block mt-4 text-indigo-600 text-sm hover:text-indigo-700">Ir a Menu Intelligence →</Link>
        </div>
      </div>
    )
  }

  // Fetch these ingredients with their supplier and 90-day invoice volume
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const [{ data: ingredients }, { data: recentLines }] = await Promise.all([
    supabase
      .from('ingredients')
      .select('id, name, current_price, unit, supplier_id, suppliers(id, name)')
      .in('id', activeIngredientIds),
    supabase
      .from('invoice_lines')
      .select('ingredient_id, quantity, units_per_pack, invoices(invoice_date)')
      .in('ingredient_id', activeIngredientIds),
  ])

  // Monthly volume estimate per ingredient (trailing 90 days / 3)
  const monthlyQtyByIngredient = new Map<string, number>()
  for (const line of recentLines || []) {
    const invDate = (line.invoices as any)?.invoice_date
    if (!invDate || new Date(invDate) < ninetyDaysAgo) continue
    const qty = (Number(line.quantity) || 0) * (Number(line.units_per_pack) || 1)
    monthlyQtyByIngredient.set(line.ingredient_id, (monthlyQtyByIngredient.get(line.ingredient_id) || 0) + qty / 3)
  }

  // Purchase frequency (total invoice_lines ever for this ingredient)
  const freqByIngredient = new Map<string, number>()
  for (const line of recentLines || []) {
    freqByIngredient.set(line.ingredient_id, (freqByIngredient.get(line.ingredient_id) || 0) + 1)
  }

  const analyzed = (ingredients || []).map(ing => {
    const monthlyQty = monthlyQtyByIngredient.get(ing.id) || 0
    const monthlySpend = ing.current_price * monthlyQty
    const freq = freqByIngredient.get(ing.id) || 0
    // Impact score: weighted combination of monthly spend (60%) and purchase frequency (40%)
    const score = monthlySpend * 0.6 + freq * 100 * 0.4
    return { ...ing, monthlyQty, monthlySpend, freq, score }
  }).sort((a, b) => b.score - a.score)

  const max = analyzed[0]?.score || 1
  const withLevel = analyzed.map(ing => ({
    ...ing,
    impactLevel: ing.score >= max * 0.6 ? 'high' : ing.score >= max * 0.25 ? 'medium' : 'low',
  }))

  const levelStyle: Record<string, string> = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-slate-100 text-slate-500',
  }
  const levelLabel: Record<string, string> = {
    high: 'High Impact',
    medium: 'Medium Impact',
    low: 'Low Impact',
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/proveedores" className="hover:text-slate-600">Supplier Intelligence</Link>
        <span>›</span>
        <span className="text-slate-600">Productos Críticos</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Productos Críticos</h1>
        <p className="text-slate-500 mt-1">Ingredientes de tus platos activos — ordenados por impacto económico en tu rentabilidad</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Producto</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Proveedor</th>
              <th className="text-center px-4 py-3 text-slate-500 font-medium">Impact Level</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">Precio actual</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">Impacto mensual est.</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {withLevel.map(ing => (
              <tr key={ing.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{ing.name}</p>
                  <p className="text-slate-400 text-xs">{ing.unit}</p>
                </td>
                <td className="px-4 py-3">
                  {ing.suppliers ? (
                    <Link href={`/proveedores/${(ing.suppliers as any).id}`} className="text-indigo-600 hover:text-indigo-700 text-sm">
                      {(ing.suppliers as any).name}
                    </Link>
                  ) : <span className="text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`text-xs px-2.5 py-0.5 rounded-full font-medium ${levelStyle[ing.impactLevel]}`}>
                    {levelLabel[ing.impactLevel]}
                  </span>
                </td>
                <td className="px-4 py-3 text-right text-slate-700">{formatCurrency(ing.current_price)}/{ing.unit}</td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{ing.monthlySpend > 0 ? formatCurrency(ing.monthlySpend) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
