'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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
  import_id: string | null
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
  cash_amount: number | null
  card_amount: number | null
  transfer_amount: number | null
}

export default function OperacionesTable({ operations }: { operations: Op[] }) {
  const router = useRouter()
  const [filterShift, setFilterShift] = useState<string>('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo] = useState('')
  const [voidingId, setVoidingId] = useState<string | null>(null)
  const [voidedIds, setVoidedIds] = useState<Set<string>>(new Set())

  const filtered = useMemo(() => {
    return operations.filter(op => {
      if (voidedIds.has(op.id)) return false
      if (filterShift !== 'all' && op.shift !== filterShift) return false
      if (filterFrom && op.operation_date < filterFrom) return false
      if (filterTo && op.operation_date > filterTo) return false
      return true
    })
  }, [operations, filterShift, filterFrom, filterTo, voidedIds])

  const shifts = [...new Set(operations.map(op => op.shift))]

  async function handleVoid(op: Op) {
    const label = `${new Date(op.operation_date + 'T12:00:00').toLocaleDateString('es-AR')} ${shiftLabels[op.shift] || ''}`
    if (!confirm(`¿Anular el cierre del ${label}? El registro se conserva para auditoría pero deja de computar en los KPIs.`)) return
    setVoidingId(op.id)
    const res = await fetch(`/api/operations/${op.id}/void`, { method: 'PATCH' })
    if (res.ok) {
      setVoidedIds(prev => new Set([...prev, op.id]))
    }
    setVoidingId(null)
    router.refresh()
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
      {/* Filters */}
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-4 flex-wrap">
        <p className="text-sm font-medium text-slate-700 shrink-0">Filtrar:</p>

        <div className="flex items-center gap-1">
          {['all', ...shifts].map(s => (
            <button
              key={s}
              onClick={() => setFilterShift(s)}
              className={`text-xs px-3 py-1 rounded-full transition-colors ${
                filterShift === s
                  ? s === 'all'
                    ? 'bg-slate-800 text-white'
                    : shiftColors[s] + ' font-medium'
                  : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? 'Todos' : shiftLabels[s] || s}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <input
            type="date"
            value={filterFrom}
            onChange={e => setFilterFrom(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600"
          />
          <span className="text-slate-400 text-xs">—</span>
          <input
            type="date"
            value={filterTo}
            onChange={e => setFilterTo(e.target.value)}
            className="text-xs border border-slate-200 rounded-lg px-2 py-1 text-slate-600"
          />
          {(filterFrom || filterTo) && (
            <button onClick={() => { setFilterFrom(''); setFilterTo('') }} className="text-xs text-slate-400 hover:text-slate-600">✕</button>
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
                <th className="text-right px-4 py-3 text-slate-500 font-medium">$/ticket</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">$/cubierto</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium text-amber-600">Cortesías</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Efectivo</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Tarjeta</th>
                <th className="px-4 py-3"></th>
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
                  <td className="px-4 py-3 text-right text-slate-700">{fmt(op.avg_cover)}</td>
                  <td className="px-4 py-3 text-right font-medium text-amber-700">
                    {op.complimentary_amount != null && op.complimentary_amount > 0 ? fmt(op.complimentary_amount) : '—'}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-600">{op.cash_amount != null ? fmt(op.cash_amount) : '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{op.card_amount != null ? fmt(op.card_amount) : '—'}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {op.import_id && (
                        <Link
                          href={`/operaciones/importar/${op.import_id}`}
                          className="text-xs text-indigo-600 hover:text-indigo-700 font-medium whitespace-nowrap"
                        >
                          Ver →
                        </Link>
                      )}
                      <button
                        onClick={() => handleVoid(op)}
                        disabled={voidingId === op.id}
                        className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                        title="Anular este cierre"
                      >
                        {voidingId === op.id ? '...' : '✕'}
                      </button>
                    </div>
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
