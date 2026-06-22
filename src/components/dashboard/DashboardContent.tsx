'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { formatCurrency, formatPercent, getMarginColor } from '@/lib/utils'

interface Recommendation {
  id: string
  title: string
  description: string
  type: string
  estimated_impact_pp: number | null
  priority: string
}

interface PriceChange {
  name: string
  oldPrice: number
  newPrice: number
  pct: number
  ingredientId: string
}

interface HighRiskSupplier {
  name: string
  id: string
}

interface Props {
  restaurantName: string
  // Qué pasó
  avgMargin: number
  avgFoodCost: number
  pctCosted: number
  costedCount: number
  totalMenuItems: number
  opsRevenue: number
  opsCovers: number
  opsAvgTicket: number | null
  hasOpsData: boolean
  // Qué requiere atención
  invoicesToReview: number
  highRiskSuppliers: HighRiskSupplier[]
  unlinkedMenuItemCount: number
  significantPriceChanges: PriceChange[]
  // Qué debería hacer
  recommendations: Recommendation[]
}

const priorityColor: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
}
const priorityLabel: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

const recConfig: Record<string, { cta: string; dest: string; icon: string }> = {
  negotiate_supplier:  { cta: 'Ver proveedor →',   dest: '/proveedores',   icon: '🤝' },
  adjust_price:        { cta: 'Ver análisis →',     dest: '/analisis',      icon: '💰' },
  review_ingredient:   { cta: 'Ir a ingrediente →', dest: '/ingredientes',  icon: '🔍' },
  menu_mix:            { cta: 'Ver análisis →',     dest: '/analisis',      icon: '📊' },
  link_recipes:        { cta: 'Costear platos →',   dest: '/analisis',      icon: '🍽' },
}

function StatCard({ label, value, sub, href, alert }: { label: string; value: string; sub?: string; href?: string; alert?: boolean }) {
  const cls = `bg-white border rounded-2xl p-5 ${alert ? 'border-red-200' : 'border-slate-200'} ${href ? 'hover:border-indigo-300 hover:shadow-sm transition-all cursor-pointer' : ''}`
  const inner = (
    <>
      <p className="text-slate-400 text-xs mb-2">{label}</p>
      <p className={`text-2xl font-bold ${alert ? 'text-red-600' : 'text-slate-900'}`}>{value}</p>
      {sub && <p className="text-slate-400 text-xs mt-1">{sub}</p>}
    </>
  )
  return href ? <Link href={href} className={cls}>{inner}</Link> : <div className={cls}>{inner}</div>
}

export default function DashboardContent({
  restaurantName,
  avgMargin, avgFoodCost, pctCosted, costedCount, totalMenuItems,
  opsRevenue, opsCovers, opsAvgTicket, hasOpsData,
  invoicesToReview, highRiskSuppliers, unlinkedMenuItemCount, significantPriceChanges,
  recommendations,
}: Props) {
  const router = useRouter()
  const [recs, setRecs] = useState(recommendations)
  const [dismissing, setDismissing] = useState<string | null>(null)

  async function dismiss(rec: Recommendation) {
    setDismissing(rec.id)
    await fetch(`/api/ai/recommendations/${rec.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'dismissed' }),
    })
    setRecs(prev => prev.filter(r => r.id !== rec.id))
    setDismissing(null)
  }

  async function act(rec: Recommendation) {
    await fetch(`/api/ai/recommendations/${rec.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'reviewed' }),
    })
    setRecs(prev => prev.filter(r => r.id !== rec.id))
  }

  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  const alertCount = (invoicesToReview > 0 ? 1 : 0)
    + highRiskSuppliers.length
    + (unlinkedMenuItemCount > 0 ? 1 : 0)
    + significantPriceChanges.length

  return (
    <div className="p-8 max-w-6xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Buenos días</h1>
          <p className="text-slate-500 mt-0.5">{restaurantName} · {today}</p>
        </div>
        {alertCount > 0 && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2">
            <span className="text-red-500 text-sm font-semibold">{alertCount} {alertCount === 1 ? 'alerta' : 'alertas'} hoy</span>
          </div>
        )}
      </div>

      {/* ── SECCIÓN 1: Qué pasó ── */}
      <div className="mb-8">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Qué pasó · últimos 7 días</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <StatCard
            label="Ventas"
            value={hasOpsData ? formatCurrency(opsRevenue) : '—'}
            sub={hasOpsData ? 'últimos 7 días' : 'sin datos aún'}
            href="/operaciones"
          />
          <StatCard
            label="Cubiertos"
            value={hasOpsData && opsCovers > 0 ? opsCovers.toLocaleString('es-AR') : '—'}
            sub={hasOpsData ? 'atendidos' : ''}
            href="/operaciones"
          />
          <StatCard
            label="Ticket promedio"
            value={opsAvgTicket ? formatCurrency(opsAvgTicket) : '—'}
            sub="por transacción"
            href="/operaciones"
          />
          <StatCard
            label="Margen promedio"
            value={costedCount > 0 ? formatPercent(avgMargin) : '—'}
            sub={`${costedCount} platos costeados`}
            href="/analisis"
          />
          <StatCard
            label="Food Cost"
            value={costedCount > 0 ? formatPercent(avgFoodCost) : '—'}
            sub="costo / precio venta"
            href="/analisis"
          />
          <StatCard
            label="Carta costeada"
            value={totalMenuItems > 0 ? formatPercent(pctCosted) : '—'}
            sub={`${costedCount} de ${totalMenuItems} platos`}
            href="/menu/salud"
          />
        </div>
      </div>

      {/* ── SECCIÓN 2: Qué requiere atención ── */}
      {alertCount > 0 && (
        <div className="mb-8">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Qué requiere atención</p>
          <div className="space-y-2">
            {invoicesToReview > 0 && (
              <Link href="/facturas?status=review_required" className="flex items-center justify-between bg-white border border-orange-200 rounded-2xl px-5 py-4 hover:border-orange-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📄</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{invoicesToReview} {invoicesToReview === 1 ? 'factura requiere revisión' : 'facturas requieren revisión'}</p>
                    <p className="text-xs text-slate-500">El OCR no pudo procesar estos documentos con suficiente confianza</p>
                  </div>
                </div>
                <span className="text-orange-600 text-sm font-semibold shrink-0">Revisar →</span>
              </Link>
            )}

            {highRiskSuppliers.map(s => (
              <Link key={s.id} href={`/proveedores/${s.id}`} className="flex items-center justify-between bg-white border border-red-200 rounded-2xl px-5 py-4 hover:border-red-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🔴</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{s.name} — proveedor en riesgo alto</p>
                    <p className="text-xs text-slate-500">Variación de precios, frecuencia de compra o inactividad prolongada</p>
                  </div>
                </div>
                <span className="text-red-600 text-sm font-semibold shrink-0">Ver proveedor →</span>
              </Link>
            ))}

            {significantPriceChanges.map(pc => (
              <Link key={pc.ingredientId} href={`/ingredientes`} className="flex items-center justify-between bg-white border border-amber-200 rounded-2xl px-5 py-4 hover:border-amber-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <span className="text-xl">📈</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {pc.name} {pc.pct > 0 ? 'subió' : 'bajó'} {Math.abs(pc.pct)}% esta semana
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatCurrency(pc.oldPrice)} → {formatCurrency(pc.newPrice)} · puede afectar el margen de platos que lo usan
                    </p>
                  </div>
                </div>
                <span className="text-amber-700 text-sm font-semibold shrink-0">Ver impacto →</span>
              </Link>
            ))}

            {unlinkedMenuItemCount > 0 && (
              <Link href="/analisis" className="flex items-center justify-between bg-white border border-slate-200 rounded-2xl px-5 py-4 hover:border-indigo-300 hover:shadow-sm transition-all">
                <div className="flex items-center gap-3">
                  <span className="text-xl">🍽</span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{unlinkedMenuItemCount} {unlinkedMenuItemCount === 1 ? 'plato sin receta vinculada' : 'platos sin receta vinculada'}</p>
                    <p className="text-xs text-slate-500">Sin receta no hay margen calculado — son puntos ciegos en tu P&L</p>
                  </div>
                </div>
                <span className="text-indigo-600 text-sm font-semibold shrink-0">Costear →</span>
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ── SECCIÓN 3: Qué debería hacer ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* AI recommendations as actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-slate-900">Qué debería hacer ahora</h2>
            {recs.length > 0 && <span className="text-xs text-slate-400">{recs.length} pendientes</span>}
          </div>

          {recs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-2">✅</p>
              <p className="text-slate-500 text-sm">Sin acciones pendientes</p>
              <p className="text-slate-400 text-xs mt-1">Cuando haya oportunidades de mejora, aparecerán aquí</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recs.map(rec => {
                const cfg = recConfig[rec.type] || { cta: 'Ver →', dest: '/analisis', icon: '💡' }
                return (
                  <div key={rec.id} className="flex items-start gap-3 p-4 rounded-xl border border-slate-100 bg-slate-50">
                    <span className="text-xl shrink-0 mt-0.5">{cfg.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900 leading-snug">{rec.title}</p>
                        {rec.estimated_impact_pp != null && (
                          <span className="text-emerald-600 text-xs font-bold shrink-0 mt-0.5">+{rec.estimated_impact_pp} pp</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{rec.description}</p>
                      <div className="flex items-center gap-2 mt-3">
                        <Link
                          href={cfg.dest}
                          onClick={() => act(rec)}
                          className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors"
                        >
                          {cfg.cta}
                        </Link>
                        <button
                          onClick={() => dismiss(rec)}
                          disabled={dismissing === rec.id}
                          className="text-xs text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-50"
                        >
                          {dismissing === rec.id ? '...' : 'Descartar'}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Acciones rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/facturas/subir',       icon: '📤', label: 'Subir factura',      sub: 'OCR automático' },
              { href: '/operaciones/importar', icon: '📊', label: 'Importar cierre',    sub: 'ventas del día' },
              { href: '/recetas/importar',     icon: '🍽', label: 'Importar recetas',   sub: 'costear la carta' },
              { href: '/recetas/nueva',        icon: '➕', label: 'Nueva receta',       sub: 'desde cero' },
              { href: '/menu/importar',        icon: '📋', label: 'Importar carta',     sub: 'menú completo' },
              { href: '/ingredientes',         icon: '✏️', label: 'Actualizar precios', sub: 'ingredientes' },
            ].map(action => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-start gap-2.5 p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                <span className="text-xl mt-0.5">{action.icon}</span>
                <div>
                  <p className="text-slate-700 text-sm font-medium leading-snug">{action.label}</p>
                  <p className="text-slate-400 text-xs">{action.sub}</p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
