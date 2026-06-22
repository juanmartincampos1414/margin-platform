import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'
import NewSupplierButton from './NewSupplierButton'

function RiskBadge({ level }: { level: string | null }) {
  if (!level) return <span className="text-slate-300 text-xs">—</span>
  const styles: Record<string, string> = {
    low: 'bg-emerald-100 text-emerald-700',
    medium: 'bg-yellow-100 text-yellow-700',
    high: 'bg-red-100 text-red-700',
  }
  const labels: Record<string, string> = { low: 'Low Risk', medium: 'Medium Risk', high: 'High Risk' }
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${styles[level] || 'bg-slate-100 text-slate-500'}`}>
      {labels[level] || level}
    </span>
  )
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-300 text-xs">—</span>
  const color = score >= 70 ? 'text-emerald-600' : score >= 40 ? 'text-yellow-600' : 'text-red-600'
  return <span className={`font-bold text-sm ${color}`}>{Math.round(score)} / 100</span>
}

function VariationBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-slate-300 text-xs">—</span>
  const positive = pct > 2
  const negative = pct < -2
  const color = positive ? 'text-red-600' : negative ? 'text-emerald-600' : 'text-slate-500'
  const sign = pct > 0 ? '+' : ''
  return <span className={`text-sm font-medium ${color}`}>{sign}{pct.toFixed(1)}%</span>
}

export default async function ProveedoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const [{ data: suppliers }, { data: phRows }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('*, invoices(id, total_amount, invoice_date), supplier_metrics(health_score, risk_level, monthly_variation_pct)')
      .eq('restaurant_id', profile?.restaurant_id)
      .order('name'),
    supabase
      .from('price_history')
      .select('supplier_id, ingredient_id')
      .eq('restaurant_id', profile?.restaurant_id),
  ])

  const ingredientsBySupplier = new Map<string, Set<string>>()
  for (const row of phRows || []) {
    if (!row.supplier_id) continue
    if (!ingredientsBySupplier.has(row.supplier_id)) ingredientsBySupplier.set(row.supplier_id, new Set())
    ingredientsBySupplier.get(row.supplier_id)!.add(row.ingredient_id)
  }

  const rows = (suppliers || []).map((s: any) => {
    const invoices = s.invoices || []
    const totalSpend = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0)
    const lastPurchase = invoices.map((inv: any) => inv.invoice_date).filter(Boolean).sort().reverse()[0] || null
    const metricsRaw = Array.isArray(s.supplier_metrics) ? s.supplier_metrics[0] : s.supplier_metrics
    return {
      ...s,
      total_spend: totalSpend,
      invoice_count: invoices.length,
      ingredient_count: ingredientsBySupplier.get(s.id)?.size || 0,
      last_purchase: lastPurchase,
      health_score: metricsRaw?.health_score ?? null,
      risk_level: metricsRaw?.risk_level ?? null,
      monthly_variation_pct: metricsRaw?.monthly_variation_pct ?? null,
    }
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Supplier Intelligence</h1>
          <p className="text-slate-500 mt-1">Inteligencia económica generada desde tus facturas</p>
        </div>
        <div className="flex gap-3">
          <Link href="/proveedores/ranking" className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50">
            📊 Ranking
          </Link>
          <Link href="/proveedores/oportunidades" className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50">
            🎯 Oportunidades
          </Link>
          <Link href="/proveedores/criticos" className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50">
            ⚠️ Críticos
          </Link>
          <NewSupplierButton />
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <p className="text-5xl mb-4">🚚</p>
          <h3 className="font-semibold text-slate-900 mb-2">No hay proveedores aún</h3>
          <p className="text-slate-500 text-sm mb-6">Subí una factura y Margin crea el proveedor automáticamente.</p>
          <Link href="/facturas/subir" className="bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors">
            Subir factura
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Proveedor</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Health Score</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Risk Level</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Variación mensual</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Gasto acumulado</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Productos</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Facturas</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Última factura</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {rows.map(s => (
                <tr key={s.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{s.name}</p>
                    {s.tax_id && <p className="text-slate-400 text-xs">{s.tax_id}</p>}
                  </td>
                  <td className="px-4 py-3 text-center"><ScoreBadge score={s.health_score} /></td>
                  <td className="px-4 py-3 text-center"><RiskBadge level={s.risk_level} /></td>
                  <td className="px-4 py-3 text-center"><VariationBadge pct={s.monthly_variation_pct} /></td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(s.total_spend)}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{s.ingredient_count}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{s.invoice_count}</td>
                  <td className="px-4 py-3 text-slate-600">{s.last_purchase ? new Date(s.last_purchase).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/proveedores/${s.id}`} className="text-indigo-600 hover:text-indigo-700 text-sm">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
