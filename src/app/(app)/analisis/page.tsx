import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatPercent, getMarginColor } from '@/lib/utils'
import { calculateRecipeCost, calculateProfitability } from '@/lib/recipes'
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

  // Analizar PLATOS DE LA CARTA, no recetas.
  // El precio de venta real es el del menú (selling_price), no el interno de la receta.
  // Esto responde "¿cuánto gano por cada plato que vendo?", no "¿cuánto vale mi receta internamente?"
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select(`
      id, name, selling_price, recipe_id,
      menu_categories(name),
      recipes(
        id, name,
        recipe_ingredients(
          quantity, unit,
          ingredients(current_price, unit)
        )
      )
    `)
    .eq('restaurant_id', profile?.restaurant_id)
    .eq('status', 'active')
    .order('name')

  const allItems = menuItems || []

  // Costed: platos con receta que tiene al menos 1 ingrediente
  const costed = allItems
    .filter(item => (item.recipes as any)?.recipe_ingredients?.length > 0)
    .map(item => {
      const rec = item.recipes as any
      const cost = calculateRecipeCost(rec.recipe_ingredients)
      const prof = calculateProfitability(item.selling_price, cost)
      return {
        id: item.id,
        name: item.name,
        selling_price: item.selling_price,
        category: (item.menu_categories as any)?.name || 'Sin categoría',
        recipe_id: item.recipe_id,
        ...prof,
      }
    })
    .sort((a, b) => a.grossMarginPct - b.grossMarginPct) // worst first

  const uncosted = allItems.filter(item => !(item.recipes as any)?.recipe_ingredients?.length)

  const avgMargin = costed.length
    ? costed.reduce((s, r) => s + r.grossMarginPct, 0) / costed.length
    : 0
  const critical = costed.filter(r => r.grossMarginPct < 35)
  const excellent = costed.filter(r => r.grossMarginPct >= 60)

  const categories = [...new Set(costed.map(r => r.category))].sort()

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Análisis de margen</h1>
        <p className="text-slate-500 mt-1">
          Rendimiento real por plato de la carta · precio de venta real, costo actual de ingredientes
        </p>
      </div>

      {/* Summary KPIs */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-slate-400 text-xs mb-1">Margen promedio</p>
          <p className={`text-3xl font-bold ${getMarginColor(avgMargin)}`}>{formatPercent(avgMargin)}</p>
          <p className="text-slate-400 text-xs mt-1">sobre {costed.length} platos costeados</p>
        </div>
        <a href="#criticos" className={`bg-red-50 border border-red-200 rounded-2xl p-5 hover:border-red-300 hover:shadow-sm transition-all ${critical.length === 0 ? 'opacity-50' : ''}`}>
          <p className="text-red-500 text-xs mb-1">Críticos (&lt;35%)</p>
          <p className="text-3xl font-bold text-red-700">{critical.length}</p>
          <p className="text-red-400 text-xs mt-1">{critical.length > 0 ? 'ver listado ↓' : 'ninguno — bien'}</p>
        </a>
        <a href="#excelentes" className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 hover:border-emerald-300 hover:shadow-sm transition-all">
          <p className="text-emerald-600 text-xs mb-1">Excelentes (≥60%)</p>
          <p className="text-3xl font-bold text-emerald-700">{excellent.length}</p>
          <p className="text-emerald-500 text-xs mt-1">ver listado ↓</p>
        </a>
        <Link href="/menu" className={`bg-orange-50 border border-orange-200 rounded-2xl p-5 hover:border-orange-300 hover:shadow-sm transition-all ${uncosted.length === 0 ? 'opacity-50' : ''}`}>
          <p className="text-orange-600 text-xs mb-1">Sin costear</p>
          <p className="text-3xl font-bold text-orange-700">{uncosted.length}</p>
          <p className="text-orange-400 text-xs mt-1">{uncosted.length > 0 ? 'costear platos →' : 'carta completa ✓'}</p>
        </Link>
      </div>

      {costed.length === 0 && uncosted.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <p className="text-4xl mb-3">📊</p>
          <p className="text-slate-500 text-sm mb-4">No hay platos activos en la carta.</p>
          <Link href="/menu" className="text-indigo-600 text-sm hover:text-indigo-700">Importar carta →</Link>
        </div>
      ) : (
        <>
          {/* Category filter — client would be ideal but keeping server-side for now */}
          {costed.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6" id="ranking">
              <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">Ranking por margen bruto</h2>
                  <p className="text-slate-400 text-xs mt-0.5">Peores primero · precio de venta real del menú</p>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  {categories.map(cat => (
                    <span key={cat} className="px-2.5 py-1 bg-slate-100 rounded-full">{cat}</span>
                  ))}
                </div>
              </div>
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">#</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Plato</th>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium hidden md:table-cell">Categoría</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Precio venta</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Costo</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Margen bruto</th>
                    <th className="px-4 py-3 text-slate-500 font-medium w-32">Visual</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {costed.map((item, i) => {
                    const isCritical = item.grossMarginPct < 35
                    const isExcellent = item.grossMarginPct >= 60
                    const anchor = isCritical ? 'criticos' : isExcellent ? 'excelentes' : ''
                    return (
                      <tr key={item.id} id={i === critical.length - 1 && isCritical ? 'criticos' : i === costed.length - excellent.length && isExcellent ? 'excelentes' : undefined} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-slate-400 font-medium tabular-nums">{i + 1}</td>
                        <td className="px-4 py-3 font-medium text-slate-800">{item.name}</td>
                        <td className="px-4 py-3 text-slate-500 hidden md:table-cell">{item.category}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(item.selling_price)}</td>
                        <td className="px-4 py-3 text-right text-slate-600">{formatCurrency(item.cost)}</td>
                        <td className={`px-4 py-3 text-right font-bold ${getMarginColor(item.grossMarginPct)}`}>{formatPercent(item.grossMarginPct)}</td>
                        <td className="px-4 py-3">
                          <div className="w-full bg-slate-100 rounded-full h-2">
                            <div
                              className={`h-2 rounded-full ${item.grossMarginPct >= 60 ? 'bg-emerald-500' : item.grossMarginPct >= 35 ? 'bg-yellow-400' : 'bg-red-500'}`}
                              style={{ width: `${Math.min(Math.max(item.grossMarginPct, 0), 100)}%` }}
                            />
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex items-center justify-end gap-3">
                            {isCritical && (
                              <Link href={`/menu?highlight=${item.id}`} className="text-xs text-red-600 hover:text-red-700 font-medium whitespace-nowrap">
                                Ajustar precio →
                              </Link>
                            )}
                            <Link href={`/recetas/${item.recipe_id}`} className="text-xs text-indigo-600 hover:text-indigo-700 whitespace-nowrap">
                              Ver receta →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Anchors for KPI nav */}
          <div id="criticos" />
          <div id="excelentes" />

          {/* Uncosted items */}
          {uncosted.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-orange-100 flex items-center justify-between">
                <div>
                  <h2 className="font-semibold text-slate-900">{uncosted.length} platos sin costear</h2>
                  <p className="text-slate-500 text-xs mt-0.5">Sin receta vinculada — no se puede calcular margen</p>
                </div>
                <Link href="/recetas/importar" className="text-sm text-orange-700 font-medium hover:text-orange-800">
                  Importar recetas →
                </Link>
              </div>
              <div className="divide-y divide-orange-100">
                {uncosted.map(item => (
                  <div key={item.id} className="flex items-center justify-between px-6 py-3">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{item.name}</p>
                      <p className="text-xs text-slate-500">{(item.menu_categories as any)?.name || 'Sin categoría'} · ${item.selling_price?.toLocaleString('es-AR') || '—'}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/recetas/nueva?menu_item_id=${item.id}`}
                        className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                      >
                        Crear receta →
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
