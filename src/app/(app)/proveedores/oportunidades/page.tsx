import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

export default async function OpportunitiesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  const restaurantId = profile?.restaurant_id

  const [{ data: opportunities }, { data: topIncreases }] = await Promise.all([
    supabase
      .from('supplier_opportunities')
      .select('*, suppliers(id, name), ingredients(name, unit)')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'open')
      .order('impact_value', { ascending: false }),
    supabase
      .from('supplier_opportunities')
      .select('*, suppliers(id, name), ingredients(name, unit)')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'open')
      .order('price_change_pct', { ascending: false })
      .limit(10),
  ])

  const totalImpact = (opportunities || []).reduce((s, o) => s + Math.abs(Number(o.impact_value)), 0)

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/proveedores" className="hover:text-slate-600">Supplier Intelligence</Link>
        <span>›</span>
        <span className="text-slate-600">Oportunidades</span>
      </div>

      <div className="flex items-start justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Oportunidades detectadas</h1>
          <p className="text-slate-500 mt-1">Aumentos de precios con impacto económico relevante</p>
        </div>
        {(opportunities || []).length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-2xl px-5 py-3 text-right">
            <p className="text-red-500 text-xs mb-0.5">Impacto mensual total</p>
            <p className="text-red-700 font-bold text-xl">{formatCurrency(totalImpact)}</p>
          </div>
        )}
      </div>

      {(opportunities || []).length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <p className="text-4xl mb-3">✅</p>
          <p className="text-slate-600 font-medium">Sin oportunidades detectadas</p>
          <p className="text-slate-400 text-sm mt-1">No se detectaron aumentos mayores al 15% en los últimos movimientos de precios.</p>
        </div>
      ) : (
        <>
          {/* Cards — Screen 31 */}
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
            {(opportunities || []).map((opp: any) => (
              <div key={opp.id} className="bg-white border border-red-200 rounded-2xl p-5">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-slate-900">{opp.ingredients?.name}</p>
                  <span className="text-red-600 font-bold">+{Number(opp.price_change_pct).toFixed(1)}%</span>
                </div>
                <Link href={`/proveedores/${(opp.suppliers as any)?.id}`} className="text-slate-400 text-xs hover:text-indigo-600">
                  {(opp.suppliers as any)?.name}
                </Link>
                <div className="mt-3 pt-3 border-t border-slate-100">
                  <p className="text-slate-400 text-xs">Impacto estimado</p>
                  <p className="text-red-700 font-bold text-lg">{formatCurrency(Math.abs(Number(opp.impact_value)))}<span className="text-slate-400 font-normal text-sm">/mes</span></p>
                </div>
              </div>
            ))}
          </div>

          {/* Top Increases table — FR-042 / Screen 33 */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-900">Top Increases</h2>
              <p className="text-slate-400 text-xs mt-0.5">Ordenado por mayor variación porcentual</p>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Producto</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Proveedor</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Variación %</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Impacto económico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(topIncreases || []).map((opp: any) => (
                  <tr key={opp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">{opp.ingredients?.name}</td>
                    <td className="px-4 py-3">
                      <Link href={`/proveedores/${(opp.suppliers as any)?.id}`} className="text-indigo-600 hover:text-indigo-700">
                        {(opp.suppliers as any)?.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">+{Number(opp.price_change_pct).toFixed(1)}%</td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(Math.abs(Number(opp.impact_value)))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
