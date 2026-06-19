import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency, formatPercent } from '@/lib/utils'
import PriceEvolutionChart from './PriceEvolutionChart'

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

  const { data: supplier } = await supabase
    .from('suppliers')
    .select('*, invoices(id, file_name, invoice_number, invoice_date, total_amount, status), ingredients(id, name, current_price, unit, status)')
    .eq('id', id)
    .eq('restaurant_id', profile?.restaurant_id)
    .single()

  if (!supplier) notFound()

  const { data: priceHistory } = await supabase
    .from('price_history')
    .select('price, recorded_at')
    .eq('supplier_id', id)
    .order('recorded_at', { ascending: true })

  const invoices = supplier.invoices || []
  const totalSpend = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0)
  const lastPurchase = invoices.map((inv: any) => inv.invoice_date).filter(Boolean).sort().reverse()[0] || null

  const byDate: Record<string, number[]> = {}
  for (const row of priceHistory || []) {
    const day = new Date(row.recorded_at).toLocaleDateString('es-AR')
    byDate[day] ??= []
    byDate[day].push(Number(row.price))
  }
  const chartData = Object.entries(byDate).map(([date, prices]) => ({
    date,
    price: prices.reduce((a, b) => a + b, 0) / prices.length,
  }))

  const pctChanges: number[] = []
  const flat = (priceHistory || []).map(r => Number(r.price))
  for (let i = 1; i < flat.length; i++) {
    if (flat[i - 1] > 0) pctChanges.push(((flat[i] - flat[i - 1]) / flat[i - 1]) * 100)
  }
  const avgVariation = pctChanges.length ? pctChanges.reduce((a, b) => a + b, 0) / pctChanges.length : 0

  return (
    <div className="p-8 max-w-4xl">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/proveedores" className="hover:text-slate-600">Proveedores</Link>
        <span>›</span>
        <span className="text-slate-600">{supplier.name}</span>
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{supplier.name}</h1>
          {supplier.tax_id && <p className="text-slate-500 text-sm mt-1">{supplier.tax_id}</p>}
        </div>
        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${supplier.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {supplier.status === 'active' ? 'Activo' : supplier.status === 'inactive' ? 'Inactivo' : 'Archivado'}
        </span>
      </div>

      {/* Dashboard cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Gasto total', value: formatCurrency(totalSpend) },
          { label: 'Facturas', value: invoices.length },
          { label: 'Ingredientes', value: (supplier.ingredients || []).length },
          { label: 'Última compra', value: lastPurchase ? new Date(lastPurchase).toLocaleDateString('es-AR') : '—' },
          { label: 'Variación de precio promedio', value: formatPercent(avgVariation), accent: avgVariation > 0 ? 'text-red-500' : avgVariation < 0 ? 'text-emerald-500' : 'text-slate-700' },
          { label: 'Condición de pago', value: supplier.payment_terms || '—' },
        ].map(c => (
          <div key={c.label} className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-slate-400 text-xs mb-1">{c.label}</p>
            <p className={`text-lg font-bold ${(c as any).accent || 'text-slate-900'}`}>{c.value}</p>
          </div>
        ))}
      </div>

      {/* Price evolution */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-4">Evolución de precios</h2>
        <PriceEvolutionChart data={chartData} />
      </div>

      {/* Ingredient catalog */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <h2 className="font-semibold text-slate-900 mb-4">Catálogo de ingredientes</h2>
        {(supplier.ingredients || []).length === 0 ? (
          <p className="text-slate-400 text-sm">Sin ingredientes asociados todavía.</p>
        ) : (
          <div className="space-y-2">
            {supplier.ingredients.map((ing: any) => (
              <div key={ing.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <p className="font-medium text-slate-800 text-sm">{ing.name}</p>
                <p className="font-semibold text-slate-800 text-sm">{formatCurrency(ing.current_price)}/{ing.unit}</p>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Purchase history */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Historial de compras</h2>
        {invoices.length === 0 ? (
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
              {invoices.map((inv: any) => (
                <tr key={inv.id}>
                  <td className="py-2.5">
                    <Link href={`/facturas/${inv.id}`} className="text-indigo-600 hover:underline">
                      {inv.invoice_number || inv.file_name || 'Factura'}
                    </Link>
                  </td>
                  <td className="py-2.5 text-slate-600">{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="py-2.5 text-right font-medium text-slate-800">{formatCurrency(Number(inv.total_amount) || 0)}</td>
                  <td className="py-2.5 text-center text-slate-500">{inv.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
