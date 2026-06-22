import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import SupplierContactEditor from './SupplierContactEditor'

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-400">Sin datos aún</span>
  const color = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-yellow-600' : 'text-red-600'
  const bg = score >= 70 ? 'bg-emerald-50 border-emerald-200' : score >= 40 ? 'bg-yellow-50 border-yellow-200' : 'bg-red-50 border-red-200'
  return (
    <div className={`inline-flex items-center gap-2 border rounded-xl px-3 py-1.5 ${bg}`}>
      <span className={`text-2xl font-bold ${color}`}>{Math.round(score)}</span>
      <span className="text-slate-400 text-sm">/ 100</span>
    </div>
  )
}

function RiskChip({ level }: { level: string | null }) {
  if (!level) return null
  const styles: Record<string, string> = {
    low: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-red-100 text-red-700',
  }
  const labels: Record<string, string> = { low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk' }
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${styles[level] || 'bg-slate-100 text-slate-500'}`}>
      {labels[level] || level}
    </span>
  )
}

export default async function ProveedorDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const restaurantId = profile?.restaurant_id

  const [{ data: supplier }, { data: invoices }, { data: phRows }, { data: opportunities }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*, supplier_metrics(health_score, risk_level, monthly_variation_pct, updated_at)')
      .eq('id', id)
      .eq('restaurant_id', restaurantId)
      .single(),
    supabase
      .from('invoices')
      .select('id, invoice_number, invoice_date, total_amount, status')
      .eq('restaurant_id', restaurantId)
      .eq('supplier_id', id)
      .order('invoice_date', { ascending: false }),
    supabase
      .from('price_history')
      .select('ingredient_id, price, recorded_at, invoices(invoice_date), ingredients(id, name, current_price, unit)')
      .eq('restaurant_id', restaurantId)
      .eq('supplier_id', id)
      .order('recorded_at', { ascending: true }),
    supabase
      .from('supplier_opportunities')
      .select('*, ingredients(name, unit)')
      .eq('restaurant_id', restaurantId)
      .eq('supplier_id', id)
      .eq('status', 'open')
      .order('impact_value', { ascending: false }),
  ])

  if (!supplier) notFound()

  const metricsRaw = Array.isArray(supplier.supplier_metrics) ? supplier.supplier_metrics[0] : supplier.supplier_metrics
  const totalSpend = (invoices || []).reduce((s, inv) => s + (Number(inv.total_amount) || 0), 0)
  const lastInvoice = invoices?.[0]?.invoice_date || null

  const distinctIngredients = new Map<string, any>()
  for (const row of phRows || []) {
    if (!distinctIngredients.has(row.ingredient_id)) distinctIngredients.set(row.ingredient_id, row.ingredients)
  }

  // Price history per ingredient for the evolution view
  const historyByIngredient = new Map<string, { date: string; price: number }[]>()
  for (const row of phRows || []) {
    const date = (row.invoices as any)?.invoice_date || row.recorded_at?.slice(0, 10)
    if (!historyByIngredient.has(row.ingredient_id)) historyByIngredient.set(row.ingredient_id, [])
    historyByIngredient.get(row.ingredient_id)!.push({ date, price: Number(row.price) })
  }

  const variationPct = metricsRaw?.monthly_variation_pct ?? null

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/proveedores" className="hover:text-slate-600">Supplier Intelligence</Link>
        <span>›</span>
        <span className="text-slate-600">{supplier.name}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{supplier.name}</h1>
          {supplier.tax_id && <p className="text-slate-500 text-sm mt-1">CUIT {supplier.tax_id}</p>}
        </div>
        <RiskChip level={metricsRaw?.risk_level ?? null} />
      </div>

      {/* KPIs — FR-035 Supplier Profile */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 col-span-2">
          <p className="text-slate-400 text-xs mb-2">Supplier Health Score</p>
          <ScoreBadge score={metricsRaw?.health_score ?? null} />
          {metricsRaw?.updated_at && (
            <p className="text-slate-300 text-xs mt-2">Actualizado {new Date(metricsRaw.updated_at).toLocaleDateString('es-AR')}</p>
          )}
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-slate-400 text-xs mb-1">Productos</p>
          <p className="text-2xl font-bold text-slate-900">{distinctIngredients.size}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-slate-400 text-xs mb-1">Facturas</p>
          <p className="text-2xl font-bold text-slate-900">{(invoices || []).length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-slate-400 text-xs mb-1">Variación mensual</p>
          {variationPct !== null ? (
            <p className={`text-2xl font-bold ${variationPct > 2 ? 'text-red-600' : variationPct < -2 ? 'text-emerald-600' : 'text-slate-700'}`}>
              {variationPct > 0 ? '+' : ''}{variationPct.toFixed(1)}%
            </p>
          ) : (
            <p className="text-slate-300 text-lg">—</p>
          )}
          <p className="text-slate-400 text-xs mt-0.5">vs mes anterior</p>
        </div>
      </div>

      {/* Opportunities — FR-040 */}
      {(opportunities || []).length > 0 && (
        <div className="mb-6">
          <h2 className="font-semibold text-slate-900 mb-3">🎯 Oportunidades detectadas</h2>
          <div className="grid grid-cols-2 gap-4">
            {(opportunities || []).slice(0, 4).map((opp: any) => (
              <div key={opp.id} className="bg-red-50 border border-red-200 rounded-2xl p-4">
                <div className="flex items-center justify-between mb-1">
                  <p className="font-semibold text-slate-900 text-sm">{opp.ingredients?.name || 'Ingrediente'}</p>
                  <span className="text-red-600 font-bold text-sm">+{Number(opp.price_change_pct).toFixed(1)}%</span>
                </div>
                <p className="text-red-700 font-bold text-lg">{formatCurrency(Math.abs(Number(opp.impact_value)))}/mes</p>
                <p className="text-slate-500 text-xs mt-1">Impacto económico estimado</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Price Evolution per ingredient — FR-037 / Screen 30 */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-4">📈 Evolución de precios por producto</h2>
        {historyByIngredient.size === 0 ? (
          <p className="text-slate-400 text-sm">Sin historial de precios todavía.</p>
        ) : (
          <div className="space-y-4">
            {Array.from(historyByIngredient.entries()).map(([ingId, points]) => {
              const ingredient = distinctIngredients.get(ingId)
              if (!ingredient) return null
              const sorted = [...points].sort((a, b) => a.date.localeCompare(b.date))
              const first = sorted[0]?.price
              const last = sorted[sorted.length - 1]?.price
              const totalPct = first > 0 ? ((last - first) / first) * 100 : 0
              return (
                <div key={ingId} className="border border-slate-100 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="font-medium text-slate-800">{ingredient.name}</p>
                    <div className="flex items-center gap-3">
                      <span className="text-slate-500 text-sm">{formatCurrency(last)}/{ingredient.unit}</span>
                      {sorted.length >= 2 && (
                        <span className={`text-xs font-semibold ${totalPct > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                          {totalPct > 0 ? '+' : ''}{totalPct.toFixed(1)}% total
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    {sorted.map((point, i) => (
                      <div key={i} className="text-center">
                        <p className="text-xs text-slate-400">{point.date ? new Date(point.date).toLocaleDateString('es-AR', { month: 'short', day: 'numeric' }) : '—'}</p>
                        <p className="text-xs font-semibold text-slate-700">{formatCurrency(point.price)}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Ingredient catalog */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-4">Catálogo de productos</h2>
        {distinctIngredients.size === 0 ? (
          <p className="text-slate-400 text-sm">Sin productos asociados todavía.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {Array.from(distinctIngredients.values()).map((ing: any) => ing && (
              <div key={ing.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <p className="font-medium text-slate-800 text-sm">{ing.name}</p>
                <p className="font-semibold text-slate-700 text-sm">{formatCurrency(ing.current_price)}/{ing.unit}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Contact info — Procurement-ready fields */}
      <SupplierContactEditor
        supplierId={supplier.id}
        initialData={{
          phone: supplier.phone || '',
          email: supplier.email || '',
          whatsapp: (supplier as any).whatsapp || '',
          instagram: (supplier as any).instagram || '',
          website: (supplier as any).website || '',
          contact_name: (supplier as any).contact_name || '',
          payment_terms: supplier.payment_terms || '',
          credit_days: supplier.credit_days ?? null,
          notes: (supplier as any).notes || '',
        }}
      />

      {/* Invoice history */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Historial de compras</h2>
          <span className="text-slate-500 text-sm">Total: {formatCurrency(totalSpend)}</span>
        </div>
        {(invoices || []).length === 0 ? (
          <p className="text-slate-400 text-sm">Sin facturas todavía.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-slate-400 text-xs">
                <th className="py-2">Factura</th>
                <th className="py-2">Fecha</th>
                <th className="py-2 text-right">Total</th>
                <th className="py-2 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {(invoices || []).map((inv: any) => (
                <tr key={inv.id}>
                  <td className="py-2.5">
                    <Link href={`/facturas/${inv.id}`} className="text-indigo-600 hover:underline">
                      {inv.invoice_number || 'Factura'}
                    </Link>
                  </td>
                  <td className="py-2.5 text-slate-600">{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="py-2.5 text-right font-medium text-slate-800">{formatCurrency(Number(inv.total_amount) || 0)}</td>
                  <td className="py-2.5 text-center text-slate-500 text-xs">{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
