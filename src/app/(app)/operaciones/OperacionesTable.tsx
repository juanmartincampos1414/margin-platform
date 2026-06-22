'use client'

import { useState, useMemo } from 'react'

const shiftLabels: Record<string, string> = { am: 'AM', pm: 'PM', full_day: 'Día completo', manual: 'Sin turno' }
const shiftColors: Record<string, string> = {
  am: 'bg-sky-100 text-sky-700',
  pm: 'bg-indigo-100 text-indigo-700',
  full_day: 'bg-emerald-100 text-emerald-700',
  manual: 'bg-slate-100 text-slate-600',
}

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

interface Op {
  id: string
  operation_date: string
  shift: string
  total_revenue: number | null
  transactions: number | null
  total_covers: number | null
  avg_ticket: number | null
  avg_cover: number | null
  salon_sales: number | null
  delivery_sales: number | null
  complimentary_amount: number | null
  credit_notes_amount: number | null
  cancellations_amount: number | null
  cash_amount: number | null
  card_amount: number | null
  transfer_amount: number | null
}

export default function OperacionesTable({ operations }: { operations: Op[] }) {
  const [filterShift, setFilterShift] = useState<string>('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')

  const filtered = useMemo(() => {
    return operations.filter(op => {
      if (filterShift !== 'all' && op.shift !== filterShift) return false
      if (filterFrom && op.operation_date < filterFrom) return false
      if (filterTo && op.operation_date > filterTo) return false
      return true
    })
  }, [operations, filterShift, filterFrom, filterTo])

  const shifts = [...new Set(operations.map(op => op.shift))]

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Filters */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-4 flex-wrap">
        <p className="text-sm font-medium text-slate-700 shrink-0">Filtrar:</p>

        {/* Shift filter */}
        <div className="flex items-center gap-1">
          {['all', ...shifts].map(s => (
            <button
              key={s}
              onClick={() => setFilterShift(s)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filterShift === s
                  ? s === 'all' ? 'bg-slate-800 text-white' : shiftColors[s].replace('bg-', 'bg-').replace('text-', 'text-') + ' font-medium'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? 'Todos' : shiftLabels[s] || s}
            </button>
          ))}
        </div>

        {/* Date range */}
        <div className="flex items-center gap-2 ml-auto">
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600"
            placeholder="Desde"
          />
          <span className="text-slate-400 text-xs">—</span>
          <input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600"
            placeholder="Hasta"
          />
          {(filterFrom || filterTo) && (
            <button onClick={() => { setFilterFrom(''); setFilterTo('') }} className="text-xs text-slate-400 hover:text-slate-600">
              ✕
            </button>
          )}
        </div>

        <p className="text-xs text-slate-400 shrink-0">{filtered.length} cierres</p>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-10 text-slate-400 text-sm">
          No hay cierres que coincidan con el filtro.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Fecha</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Turno</th>
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
              {filtered.map(op => (
                <tr key={op.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-800 whitespace-nowrap">
                    {new Date(op.operation_date + 'T12:00:00').toLocaleDateString('es-AR', {
                      weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
                    })}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${shiftColors[op.shift] || 'bg-slate-100 text-slate-600'}`}>
                      {shiftLabels[op.shift] || op.shift}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{fmt(op.total_revenue)}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{op.total_covers ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{op.transactions ?? '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-700">{fmt(op.avg_ticket)}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{op.salon_sales != null ? fmt(op.salon_sales) : '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{op.delivery_sales != null ? fmt(op.delivery_sales) : '—'}</td>
                  <td className="px-4 py-3 text-right font-medium text-amber-700">
                    {op.complimentary_amount != null && op.complimentary_amount > 0 ? fmt(op.complimentary_amount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{op.cash_amount != null ? fmt(op.cash_amount) : '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{op.card_amount != null ? fmt(op.card_amount) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
