import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

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
    .select('*, operations_imports(file_name, source_type)')
    .eq('restaurant_id', profile?.restaurant_id)
    .eq('status', 'confirmed')
    .order('operation_date', { ascending: false })
    .limit(60)

  const totalRevenue = (operations || []).reduce((s, op) => s + (Number(op.total_revenue) || 0), 0)
  const totalCovers = (operations || []).reduce((s, op) => s + (Number(op.total_covers) || 0), 0)
  const daysWithData = (operations || []).length
  const avgTicket = totalCovers > 0 ? Math.round(totalRevenue / totalCovers) : 0

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

      {(operations || []).length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <p className="text-5xl mb-4">📊</p>
          <h3 className="font-semibold text-slate-900 mb-2">Sin datos operativos aún</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
            Importá tu primer cierre de caja o reporte POS. Margin extrae ventas, cubiertos y ticket promedio automáticamente.
          </p>
          <Link href="/operaciones/importar" className="bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors">
            Importar primer reporte
          </Link>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-4 gap-4 mb-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Ventas totales</p>
              <p className="text-2xl font-bold text-slate-900">${totalRevenue.toLocaleString('es-AR')}</p>
              <p className="text-slate-400 text-xs mt-0.5">{daysWithData} días confirmados</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Total cubiertos</p>
              <p className="text-2xl font-bold text-slate-900">{totalCovers.toLocaleString('es-AR')}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Ticket promedio</p>
              <p className="text-2xl font-bold text-slate-900">${avgTicket.toLocaleString('es-AR')}</p>
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Días con datos</p>
              <p className="text-2xl font-bold text-slate-900">{daysWithData}</p>
            </div>
          </div>

          {/* Operations table */}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Fecha</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Ventas</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Cubiertos</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Ticket prom.</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Efectivo</th>
                  <th className="text-right px-4 py-3 text-slate-500 font-medium">Tarjeta</th>
                  <th className="text-left px-4 py-3 text-slate-500 font-medium">Fuente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {(operations || []).map((op: any) => (
                  <tr key={op.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-800">
                      {new Date(op.operation_date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">
                      {op.total_revenue ? `$${Number(op.total_revenue).toLocaleString('es-AR')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {op.total_covers ?? '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-700">
                      {op.avg_ticket ? `$${Number(op.avg_ticket).toLocaleString('es-AR')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {op.cash_amount ? `$${Number(op.cash_amount).toLocaleString('es-AR')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-right text-slate-600">
                      {op.card_amount ? `$${Number(op.card_amount).toLocaleString('es-AR')}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-slate-400 text-xs">
                      {op.operations_imports?.source_type || '—'}
                    </td>
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
