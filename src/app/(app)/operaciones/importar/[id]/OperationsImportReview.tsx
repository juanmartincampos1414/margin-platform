'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface ProductMixItem { id: string; item_name: string; quantity_sold: number | null; unit_revenue: number | null; total_revenue: number | null; menu_items: { id: string; name: string } | null }
interface DailyOp {
  id: string
  operation_date: string
  total_revenue: number | null
  total_covers: number | null
  avg_ticket: number | null
  cash_amount: number | null
  card_amount: number | null
  transfer_amount: number | null
  other_payment_amount: number | null
  lunch_covers: number | null
  dinner_covers: number | null
  status: string
  daily_product_mix: ProductMixItem[]
}

interface Props { importId: string; importRow: any; operations: DailyOp[] }

function fmt(n: number | null) { return n != null ? `$${n.toLocaleString('es-AR')}` : '—' }
function fmtNum(n: number | null) { return n != null ? n.toLocaleString('es-AR') : '—' }

export default function OperationsImportReview({ importId, importRow, operations: initialOps }: Props) {
  const router = useRouter()
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [confirmedCount, setConfirmedCount] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(initialOps[0]?.id || null)

  const totalRevenue = initialOps.reduce((s, op) => s + (op.total_revenue || 0), 0)
  const totalCovers = initialOps.reduce((s, op) => s + (op.total_covers || 0), 0)

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
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{confirmedCount} {confirmedCount === 1 ? 'día confirmado' : 'días confirmados'}</h2>
        <p className="text-slate-500 mb-8">Los datos operativos están disponibles en tu historial. Cuando tengas datos de costos, Margin podrá calcular tu P&L.</p>
        <Link href="/operaciones" className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium">
          Ver operaciones
        </Link>
      </div>
    )
  }

  return (
    <>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revisión de datos operativos</h1>
          <p className="text-slate-500 mt-1">
            <span className="font-medium">{initialOps.length} {initialOps.length === 1 ? 'día detectado' : 'días detectados'}</span>
            {importRow.period_start && ` · ${new Date(importRow.period_start).toLocaleDateString('es-AR')} – ${new Date(importRow.period_end || importRow.period_start).toLocaleDateString('es-AR')}`}
            {' · '}Confianza OCR: <span className={`font-medium ${(importRow.ocr_confidence || 0) >= 80 ? 'text-emerald-600' : 'text-yellow-600'}`}>{importRow.ocr_confidence || 0}%</span>
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

      {/* Summary KPIs */}
      {initialOps.length > 1 && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-slate-400 text-xs mb-1">Ventas totales del período</p>
            <p className="text-2xl font-bold text-slate-900">{fmt(totalRevenue)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-slate-400 text-xs mb-1">Total cubiertos</p>
            <p className="text-2xl font-bold text-slate-900">{fmtNum(totalCovers)}</p>
          </div>
          <div className="bg-white border border-slate-200 rounded-2xl p-4">
            <p className="text-slate-400 text-xs mb-1">Ticket promedio</p>
            <p className="text-2xl font-bold text-slate-900">{totalCovers > 0 ? fmt(Math.round(totalRevenue / totalCovers)) : '—'}</p>
          </div>
        </div>
      )}

      {/* Day cards */}
      <div className="space-y-3">
        {initialOps.map(op => (
          <div key={op.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div
              className="flex items-center gap-6 px-5 py-4 cursor-pointer hover:bg-slate-50"
              onClick={() => setExpandedId(expandedId === op.id ? null : op.id)}
            >
              <div className="font-semibold text-slate-900 w-28 shrink-0">
                {new Date(op.operation_date + 'T12:00:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
              <div className="flex-1 grid grid-cols-4 gap-4">
                <div>
                  <p className="text-slate-400 text-xs">Ventas</p>
                  <p className="font-semibold text-slate-900">{fmt(op.total_revenue)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Cubiertos</p>
                  <p className="font-semibold text-slate-900">{fmtNum(op.total_covers)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Ticket prom.</p>
                  <p className="font-semibold text-slate-900">{fmt(op.avg_ticket)}</p>
                </div>
                <div>
                  <p className="text-slate-400 text-xs">Productos en mix</p>
                  <p className="font-semibold text-slate-900">{op.daily_product_mix?.length || 0}</p>
                </div>
              </div>
              <span className="text-slate-300 text-sm shrink-0">{expandedId === op.id ? '▲' : '▼'}</span>
            </div>

            {expandedId === op.id && (
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 space-y-4">
                {/* Payment mix */}
                {(op.cash_amount || op.card_amount || op.transfer_amount) && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Medios de pago</p>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { label: 'Efectivo', value: op.cash_amount },
                        { label: 'Tarjeta', value: op.card_amount },
                        { label: 'Transferencia', value: op.transfer_amount },
                        { label: 'Otro', value: op.other_payment_amount },
                      ].map(p => p.value ? (
                        <div key={p.label} className="bg-white rounded-lg p-2 border border-slate-100 text-center">
                          <p className="text-xs text-slate-400">{p.label}</p>
                          <p className="text-sm font-semibold text-slate-700">{fmt(p.value)}</p>
                        </div>
                      ) : null)}
                    </div>
                  </div>
                )}

                {/* Product mix */}
                {op.daily_product_mix?.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Mix de productos</p>
                    <div className="space-y-1">
                      {op.daily_product_mix.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between py-1.5 px-3 bg-white rounded-lg border border-slate-100">
                          <div className="flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full ${p.menu_items ? 'bg-emerald-400' : 'bg-yellow-400'}`} title={p.menu_items ? 'Match con menú' : 'Sin match en menú'} />
                            <p className="text-sm text-slate-700">{p.item_name}</p>
                            {p.menu_items && <span className="text-xs text-emerald-600">→ {p.menu_items.name}</span>}
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            {p.quantity_sold && <span className="text-slate-500">{p.quantity_sold} und.</span>}
                            {p.total_revenue && <span className="font-medium text-slate-700">{fmt(p.total_revenue)}</span>}
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
