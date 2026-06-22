import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import OperacionesTable from './OperacionesTable'

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
    .select('id, import_id, operation_date, shift, total_revenue, transactions, total_covers, avg_ticket, avg_cover, salon_sales, delivery_sales, complimentary_amount, credit_notes_amount, cancellations_amount, cash_amount, card_amount, transfer_amount')
    .eq('restaurant_id', profile?.restaurant_id)
    .eq('status', 'confirmed')
    .order('operation_date', { ascending: false })
    .order('shift', { ascending: true })
    .limit(180)

  const ops = operations || []
  const totalRevenue = ops.reduce((s, op) => s + (Number(op.total_revenue) || 0), 0)
  const totalCovers = ops.reduce((s, op) => s + (Number(op.total_covers) || 0), 0)
  const totalTransactions = ops.reduce((s, op) => s + (Number(op.transactions) || 0), 0)
  const totalComplimentary = ops.reduce((s, op) => s + (Number(op.complimentary_amount) || 0), 0)
  const daysWithData = new Set(ops.map(op => op.operation_date)).size

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Operations Intelligence</h1>
          <p className="text-slate-500 mt-1">Histórico operativo por día y turno</p>
        </div>
        <Link
          href="/operaciones/importar"
          className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          + Importar cierre
        </Link>
      </div>

      {ops.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <p className="text-5xl mb-4">📊</p>
          <h3 className="font-semibold text-slate-900 mb-2">Sin datos operativos aún</h3>
          <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
            Importá tu primer cierre de caja. Margin extrae ventas, cubiertos, ticket promedio y cortesías automáticamente.
          </p>
          <Link href="/operaciones/importar" className="bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors">
            Importar primer cierre
          </Link>
        </div>
      ) : (
        <>
          {/* Summary KPIs */}
          <div className="grid grid-cols-5 gap-4 mb-8">
            <div className="bg-white border border-slate-200 rounded-2xl p-5">
              <p className="text-slate-400 text-xs mb-1">Ventas totales</p>
              <p className="text-2xl font-bold text-slate-900">${Math.round(totalRevenue).toLocaleString('es-AR')}</p>
              <p className="text-slate-400 text-xs mt-0.5">{daysWithData} días · {ops.length} cierres</p>
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
              <p className="text-2xl font-bold text-slate-900">
                {totalCovers > 0 ? `$${Math.round(totalRevenue / totalCovers).toLocaleString('es-AR')}` : '—'}
              </p>
            </div>
            {totalComplimentary > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                <p className="text-amber-600 text-xs mb-1">Cortesías acumuladas</p>
                <p className="text-2xl font-bold text-amber-700">${Math.round(totalComplimentary).toLocaleString('es-AR')}</p>
              </div>
            )}
          </div>

          {/* Table with client-side filters */}
          <OperacionesTable operations={ops} />
        </>
      )}
    </div>
  )
}
