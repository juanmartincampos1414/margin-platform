import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { formatCurrency } from '@/lib/utils'

export default async function ProveedoresPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: suppliers } = await supabase
    .from('suppliers')
    .select('*, invoices(id, total_amount, invoice_date), ingredients(id)')
    .eq('restaurant_id', profile?.restaurant_id)
    .order('name')

  const rows = (suppliers || []).map(s => {
    const invoices = s.invoices || []
    const totalSpend = invoices.reduce((sum: number, inv: any) => sum + (Number(inv.total_amount) || 0), 0)
    const lastPurchase = invoices.map((inv: any) => inv.invoice_date).filter(Boolean).sort().reverse()[0] || null
    return { ...s, total_spend: totalSpend, invoice_count: invoices.length, ingredient_count: (s.ingredients || []).length, last_purchase: lastPurchase }
  })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Proveedores</h1>
          <p className="text-slate-500 mt-1">Generados automáticamente desde tus facturas</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <p className="text-5xl mb-4">🚚</p>
          <h3 className="font-semibold text-slate-900 mb-2">No hay proveedores aún</h3>
          <p className="text-slate-500 text-sm mb-6">Subí una factura y Margin va a crear el proveedor automáticamente.</p>
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
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Gasto acumulado</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Facturas</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Ingredientes</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Última compra</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Estado</th>
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
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(s.total_spend)}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{s.invoice_count}</td>
                  <td className="px-4 py-3 text-center text-slate-600">{s.ingredient_count}</td>
                  <td className="px-4 py-3 text-slate-600">{s.last_purchase ? new Date(s.last_purchase).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {s.status === 'active' ? 'Activo' : s.status === 'inactive' ? 'Inactivo' : 'Archivado'}
                    </span>
                  </td>
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
