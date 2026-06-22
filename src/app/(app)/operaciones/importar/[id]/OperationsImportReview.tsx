'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface TopSeller { id: string; item_name: string; quantity_sold: number | null; total_revenue: number | null }
interface DailyOp {
  id: string
  operation_date: string
  total_revenue: number | null
  transactions: number | null
  total_covers: number | null
  avg_ticket: number | null
  avg_cover: number | null
  salon_sales: number | null
  delivery_sales: number | null
  cash_amount: number | null
  card_amount: number | null
  transfer_amount: number | null
  other_payment_amount: number | null
  complimentary_amount: number | null
  credit_notes_amount: number | null
  cancellations_amount: number | null
  status: string
  daily_product_mix: TopSeller[]
}

interface Props { importId: string; importRow: any; operations: DailyOp[] }

function fmt(n: number | null | undefined) {
  if (n == null) return '—'
  return `$${Math.round(n).toLocaleString('es-AR')}`
}
function fmtNum(n: number | null | undefined) {
  return n != null ? n.toLocaleString('es-AR') : '—'
}

export default function OperationsImportReview({ importId, importRow, operations: initialOps }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(initialOps[0]?.id || null)

  const totalRevenue = initialOps.reduce((s, op) => s + (op.total_revenue || 0), 0)
  const totalCovers = initialOps.reduce((s, op) => s + (op.total_covers || 0), 0)
  const totalTransactions = initialOps.reduce((s, op) => s + (op.transactions || 0), 0)
  const totalComplimentary = initialOps.reduce((s, op) => s + (op.complimentary_amount || 0), 0)

  async function handleConfirm() {
    setConfirming(true)
    const res = await fetch(`/api/operations/import/${importId}/confirm`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setConfirmedCount(data.confirmed)
      setDone(true)
    }
    setConfirming(false)
  }

  if (done) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-4">✅</p>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">
          {confirmedCount} {confirmedCount === 1 ? 'día confirmado' : 'días confirmados'}
        </h2>
        <p className="text-slate-500 mb-8">
          Los datos operativos están disponibles en tu historial.
          Cuando tengas datos de costos, Margin podrá calcular tu P&L.
        </p>
        <Link href="/operaciones" className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium transition-colors">
          Ver operaciones →
        </Link>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revisión de datos operativos</h1>
          <p className="text-slate-500 mt-1">
            <span className="font-medium">{initialOps.length} {initialOps.length === 1 ? 'día detectado' : 'días detectados'}</span>
            {importRow.period_start && (
              ` · ${new Date(importRow.period_start + 'T12:00:00').toLocaleDateString('es-AR')}${
                importRow.period_end && importRow.period_end !== importRow.period_start
                  ? ` – ${new Date(importRow.period_end + 'T12:00:00').toLocaleDateString('es-AR')}`
                  : ''
              }`
            )}
            {' · '}Confianza OCR:{' '}
            <span className={`font-medium ${(importRow.ocr_confidence || 0) >= 80 ? 'text-emerald-600' : 'text-yellow-600'}`}>
              {importRow.ocr_confidence || 0}%
            </span>
          </p>
        </div>
        <button
          onClick={handleConfirm}
          disabled={confirming || initialOps.length === 0}
          className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors"
        >
          {confirming ? 'Confirmando...' : `Confirmar ${initialOps.length} ${initialOps.length === 1 ? 'día' : 'días'}`}
        </button>
      </div>

      {/* Period summary — only shown when multiple days */}
      {initialOps.length > 1 && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-slate-400 text-xs mb-1">Ventas totales</p>
            <p className="text-2xl font-bold text-slate-900">{fmt(totalRevenue)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-slate-400 text-xs mb-1">Total cubiertos</p>
            <p className="text-2xl font-bold text-slate-900">{fmtNum(totalCovers)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-slate-400 text-xs mb-1">Tickets</p>
            <p className="text-2xl font-bold text-slate-900">{fmtNum(totalTransactions)}</p>
          </div>
          {totalComplimentary > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <p className="text-amber-600 text-xs mb-1">Cortesías / invitaciones</p>
              <p className="text-2xl font-bold text-amber-700">{fmt(totalComplimentary)}</p>
            </div>
          )}
        </div>
      )}

      {/* Day cards */}
      <div className="space-y-3">
        {initialOps.map(op => (
          <div key={op.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            {/* Summary row — always visible */}
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50"
              onClick={() => setExpandedId(expandedId === op.id ? null : op.id)}
            >
              <div className="font-semibold text-slate-900 w-32 shrink-0 text-sm">
                {new Date(op.operation_date + 'T12:00:00').toLocaleDateString('es-AR', {
                  weekday: 'short', day: 'numeric', month: 'short'
                })}
              </div>
              <div className="flex-1 grid grid-cols-5 gap-3 text-sm">
                <div>
                  <p className="text-slate-400 text-xs">Ventas</p>
                  <p className="font-semibold text-slate-900">{fmt(op.total_revenue)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Cubiertos</p>
                  <p className="font-semibold text-slate-900">{fmtNum(op.total_covers)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Tickets</p>
                  <p className="font-semibold text-slate-900">{fmtNum(op.transactions)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Ticket prom.</p>
                  <p className="font-semibold text-slate-900">{fmt(op.avg_ticket)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Por cubierto</p>
                  <p className="font-semibold text-slate-900">{fmt(op.avg_cover)}</p>
                </div>
              </div>
              <span className="text-slate-300 text-xs shrink-0">{expandedId === op.id ? '▲' : '▼'}</span>
            </div>

            {/* Expanded detail */}
            {expandedId === op.id && (
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 space-y-5">

                {/* Salon / Delivery split */}
                {(op.salon_sales != null || op.delivery_sales != null) && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Canal de ventas</p>
                    <div className="grid grid-cols-2 gap-3">
                      {op.salon_sales != null && (
                        <div className="bg-white rounded-xl p-3 border border-slate-100">
                          <p className="text-xs text-slate-400">Salón</p>
                          <p className="text-base font-semibold text-slate-800">{fmt(op.salon_sales)}</p>
                        </div>
                      )}
                      {op.delivery_sales != null && (
                        <div className="bg-white rounded-xl p-3 border border-slate-100">
                          <p className="text-xs text-slate-400">Delivery</p>
                          <p className="text-base font-semibold text-slate-800">{fmt(op.delivery_sales)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Cortesías / créditos / anulaciones */}
                {(op.complimentary_amount != null || op.credit_notes_amount != null || op.cancellations_amount != null) && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Ajustes operativos</p>
                    <div className="grid grid-cols-3 gap-3">
                      {op.complimentary_amount != null && (
                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                          <p className="text-xs text-amber-600">Cortesías</p>
                          <p className="text-base font-semibold text-amber-800">{fmt(op.complimentary_amount)}</p>
                        </div>
                      )}
                      {op.credit_notes_amount != null && (
                        <div className="bg-white rounded-xl p-3 border border-slate-100">
                          <p className="text-xs text-slate-400">Notas de crédito</p>
                          <p className="text-base font-semibold text-slate-800">{fmt(op.credit_notes_amount)}</p>
                        </div>
                      )}
                      {op.cancellations_amount != null && (
                        <div className="bg-white rounded-xl p-3 border border-slate-100">
                          <p className="text-xs text-slate-400">Anulaciones</p>
                          <p className="text-base font-semibold text-slate-800">{fmt(op.cancellations_amount)}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Payment mix */}
                {(op.cash_amount != null || op.card_amount != null || op.transfer_amount != null || op.other_payment_amount != null) && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Medios de pago</p>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Efectivo', value: op.cash_amount },
                        { label: 'Tarjeta', value: op.card_amount },
                        { label: 'Transferencia', value: op.transfer_amount },
                        { label: 'Otro', value: op.other_payment_amount },
                      ].filter(p => p.value != null).map(p => (
                        <div key={p.label} className="bg-white rounded-xl p-3 border border-slate-100 text-center">
                          <p className="text-xs text-slate-400">{p.label}</p>
                          <p className="text-sm font-semibold text-slate-700">{fmt(p.value)}</p>
                          {op.total_revenue ? (
                            <p className="text-xs text-slate-400 mt-0.5">
                              {Math.round(((p.value || 0) / op.total_revenue) * 100)}%
                            </p>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Top sellers */}
                {op.daily_product_mix?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                      Top sellers ({op.daily_product_mix.length})
                    </p>
                    <div className="space-y-1">
                      {op.daily_product_mix.map((p, i) => (
                        <div key={p.id} className="flex items-center justify-between py-1.5 px-3 bg-white rounded-lg border border-slate-100">
                          <div className="flex items-center gap-3">
                            <span className="text-xs text-slate-400 w-5 text-right">{i + 1}</span>
                            <p className="text-sm text-slate-700">{p.item_name}</p>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            {p.quantity_sold != null && (
                              <span className="text-slate-400">{p.quantity_sold} und.</span>
                            )}
                            {p.total_revenue != null && (
                              <span className="font-medium text-slate-700">{fmt(p.total_revenue)}</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  )
}
