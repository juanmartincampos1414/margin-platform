import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

export default async function OperacionesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: operations } = await supabase
    .from('daily_operations')
    .select('id, operation_date, total_revenue, transactions, total_covers, avg_ticket, avg_cover, salon_sales, delivery_sales, complimentary_amount, credit_notes_amount, cancellations_amount, cash_amount, card_amount, transfer_amount')
    .eq('restaurant_id', profile?.restaurant_id)
    .eq('status', 'confirmed')
    .order('operation_date', { ascending: false })
    .limit(90)

  const ops = operations || []
  const totalRevenue = ops.reduce((s, op) => s + (Number(op.total_revenue) || 0), 0)
  const totalCovers = ops.reduce((s, op) => s + (Number(op.total_covers) || 0), 0)
  const totalTransactions = ops.reduce((s, op) => s + (Number(op.transactions) || 0), 0)
  const totalComplimentary = ops.reduce((s, op) => s + (Number(op.complimentary_amount) || 0), 0)
  const daysWithData = ops.length
  const avgTicket = totalCovers > 0 ? totalRevenue / totalCovers : 0

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations Intelligence</h1>
          <p className="text-slate-500 mt-1">Ventas, cubiertos y operaciones diarias confirmadas</p>
        </div>
        <Link
          href="/operaciones/importar"
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          + Importar ventas
        </Link>
      </div>

      {ops.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <p className="text-5xl mb-4">📊</p>
          <h3 className="font-semibold text-slate-900 mb-2">Sin datos operativos aún</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
            Importá tu primer cierre de caja o reporte POS. Margin extrae ventas, cubiertos, ticket promedio y cortesías automáticamente.
          </p>
          <Link href="/operaciones/importar" className="bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors">
            Importar primer reporte
          </Link>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-5 gap-4 mb-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Ventas totales</p>
              <p className="text-2xl font-bold text-slate-900">{fmt(totalRevenue)}</p>
              <p className="text-slate-400 text-xs mt-0.5">{daysWithData} días</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Cubiertos</p>
              <p className="text-2xl font-bold text-slate-900">{totalCovers.toLocaleString('es-AR')}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Tickets</p>
              <p className="text-2xl font-bold text-slate-900">{totalTransactions.toLocaleString('es-AR')}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Ticket prom. / cubierto</p>
              <p className="text-2xl font-bold text-slate-900">{fmt(avgTicket)}</p>
            </div>
            {totalComplimentary > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <p className="text-amber-600 text-xs mb-1">Cortesías acumuladas</p>
                <p className="text-2xl font-bold text-amber-700">{fmt(totalComplimentary)}</p>
              </div>
            )}
          </div>

          {/* Operations table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-100 flex items-center justify-between">
              <h2 className="font-medium text-slate-900 text-sm">Historial por día</h2>
              <p className="text-slate-400 text-xs">Últimos {daysWithData} días confirmados</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-4 py-3 text-slate-500 font-medium">Fecha</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Ventas</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Cubiertos</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Tickets</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Ticket prom.</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Salón</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Delivery</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium text-amber-600">Cortesías</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Efectivo</th>
                    <th className="text-right px-4 py-3 text-slate-500 font-medium">Tarjeta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {ops.map((op: any) => (
                    <tr key={op.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                        {new Date(op.operation_date + 'T12:00:00').toLocaleDateString('es-AR', {
                          weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                        })}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmt(op.total_revenue)}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{op.total_covers ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{op.transactions ?? '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{fmt(op.avg_ticket)}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{op.salon_sales != null ? fmt(op.salon_sales) : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{op.delivery_sales != null ? fmt(op.delivery_sales) : '—'}</td>
                      <td className="px-4 py-3 text-right text-amber-700 font-medium">
                        {op.complimentary_amount != null && op.complimentary_amount > 0 ? fmt(op.complimentary_amount) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">{op.cash_amount != null ? fmt(op.cash_amount) : '—'}</td>
                      <td className="px-4 py-3 text-right text-slate-600">{op.card_amount != null ? fmt(op.card_amount) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
