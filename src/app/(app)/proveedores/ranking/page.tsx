import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

export default async function SupplierRankingPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('restaurant_id').eq('id', user.id).single()
  const restaurantId = profile?.restaurant_id

  const [{ data: suppliers }, { data: invoices }, { data: phRows }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, supplier_metrics(health_score, risk_level, monthly_variation_pct)')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active'),
    supabase
      .from('invoices')
      .select('id, supplier_id, total_amount')
      .eq('restaurant_id', restaurantId),
    supabase
      .from('price_history')
      .select('supplier_id, ingredient_id')
      .eq('restaurant_id', restaurantId),
  ])

  const spendBySupplier = new Map<string, number>()
  const invoiceCountBySupplier = new Map<string, number>()
  for (const inv of invoices || []) {
    if (!inv.supplier_id) continue
    spendBySupplier.set(inv.supplier_id, (spendBySupplier.get(inv.supplier_id) || 0) + Number(inv.total_amount || 0))
    invoiceCountBySupplier.set(inv.supplier_id, (invoiceCountBySupplier.get(inv.supplier_id) || 0) + 1)
  }
  const ingredientsBySupplier = new Map<string, Set<string>>()
  for (const row of phRows || []) {
    if (!row.supplier_id) continue
    if (!ingredientsBySupplier.has(row.supplier_id)) ingredientsBySupplier.set(row.supplier_id, new Set())
    ingredientsBySupplier.get(row.supplier_id)!.add(row.ingredient_id)
  }

  const rows = (suppliers || []).map((s: any) => {
    const m = Array.isArray(s.supplier_metrics) ? s.supplier_metrics[0] : s.supplier_metrics
    return {
      id: s.id, name: s.name,
      health_score: m?.health_score ?? null,
      risk_level: m?.risk_level ?? null,
      total_spend: spendBySupplier.get(s.id) || 0,
      invoice_count: invoiceCountBySupplier.get(s.id) || 0,
      ingredient_count: ingredientsBySupplier.get(s.id)?.size || 0,
    }
  })

  const scored = rows.filter(r => r.health_score !== null)
  const mostStable = [...scored].sort((a, b) => b.health_score! - a.health_score!).slice(0, 5)
  const mostVolatile = [...scored].sort((a, b) => a.health_score! - b.health_score!).slice(0, 5)
  const highestImpact = [...rows].sort((a, b) => b.total_spend - a.total_spend).slice(0, 5)
  const mostUsed = [...rows].sort((a, b) => b.ingredient_count - a.ingredient_count || b.invoice_count - a.invoice_count).slice(0, 5)

  function RankBlock({ title, icon, items, valueKey, valueLabel, valueFn }: any) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="font-semibold text-slate-900 mb-4">{icon} {title}</h2>
        {items.length === 0 ? (
          <p className="text-slate-400 text-sm">Sin datos suficientes.</p>
        ) : (
          <div className="space-y-2">
            {items.map((s: any, i: number) => (
              <div key={s.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className="text-slate-300 font-bold text-sm w-5">{i + 1}</span>
                  <Link href={`/proveedores/${s.id}`} className="font-medium text-slate-800 hover:text-indigo-600 text-sm">{s.name}</Link>
                </div>
                <span className="text-sm font-semibold text-slate-700">{valueFn(s)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="p-8">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/proveedores" className="hover:text-slate-600">Supplier Intelligence</Link>
        <span>›</span>
        <span className="text-slate-600">Ranking</span>
      </div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Supplier Ranking</h1>
        <p className="text-slate-500 mt-1">Top 5 proveedores por categoría — generado automáticamente desde tus facturas</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <RankBlock title="Most Stable" icon="✅" items={mostStable} valueFn={(s: any) => s.health_score !== null ? `${Math.round(s.health_score)} / 100` : '—'} />
        <RankBlock title="Most Volatile" icon="⚠️" items={mostVolatile} valueFn={(s: any) => s.health_score !== null ? `${Math.round(s.health_score)} / 100` : '—'} />
        <RankBlock title="Highest Impact" icon="💰" items={highestImpact} valueFn={(s: any) => formatCurrency(s.total_spend)} />
        <RankBlock title="Most Used" icon="📦" items={mostUsed} valueFn={(s: any) => `${s.ingredient_count} productos · ${s.invoice_count} facturas`} />
      </div>
    </div>
  )
}
