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

interface Props {
  restaurantName: string
  avgMargin: number
  pctCosted: number
  costedCount: number
  totalMenuItems: number
  opsRevenue: number
  opsAvgTicket: number | null
  hasOpsData: boolean
  invoicesToReview: number
  pendingRecommendationsCount: number
  recommendations: Recommendation[]
  unlinkedMenuItemCount: number
  highRiskSuppliers: string[]
}

const priorityColor: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
}
const priorityLabel: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

// Map recommendation type to the most specific actionable destination
const typeDestination: Record<string, string> = {
  negotiate_supplier: '/proveedores',
  adjust_price: '/analisis',
  review_ingredient: '/ingredientes',
  menu_mix: '/analisis',
  link_recipes: '/analisis',
}
const typeCTA: Record<string, string> = {
  negotiate_supplier: 'Ver proveedores →',
  adjust_price: 'Ver análisis →',
  review_ingredient: 'Ir a ingredientes →',
  menu_mix: 'Ver análisis →',
  link_recipes: 'Costear platos →',
}

export default function DashboardContent({
  restaurantName,
  avgMargin, pctCosted, costedCount, totalMenuItems,
  opsRevenue, opsAvgTicket, hasOpsData,
  invoicesToReview, pendingRecommendationsCount,
  recommendations, unlinkedMenuItemCount, highRiskSuppliers,
}: Props) {
  const router = useRouter()
  const [recs, setRecs] = useState(recommendations)
  const [activeRec, setActiveRec] = useState<Recommendation | null>(null)
  const [acting, setActing] = useState(false)

  async function handleRecAction(rec: Recommendation, status: 'reviewed' | 'dismissed') {
    setActing(true)
    await fetch(`/api/ai/recommendations/${rec.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    setRecs(prev => prev.filter(r => r.id !== rec.id))
    setActiveRec(null)
    setActing(false)
    router.refresh()
  }

  const today = new Date().toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Buenos días</h1>
        <p className="text-slate-500 mt-1">{restaurantName} · {today}</p>
      </div>

      {/* Alert banners — only shown when actionable */}
      <div className="space-y-3 mb-6">
        {invoicesToReview > 0 && (
          <Link href="/facturas?status=review_required" className="flex items-center justify-between bg-orange-50 border border-orange-200 rounded-2xl px-5 py-3.5 hover:border-orange-300 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-lg">⚠️</span>
              <p className="text-sm font-medium text-slate-900">
                {invoicesToReview} {invoicesToReview === 1 ? 'factura requiere' : 'facturas requieren'} revisión
              </p>
            </div>
            <span className="text-orange-600 text-sm font-medium">Revisar →</span>
          </Link>
        )}
        {highRiskSuppliers.length > 0 && (
          <Link href="/proveedores" className="flex items-center justify-between bg-red-50 border border-red-200 rounded-2xl px-5 py-3.5 hover:border-red-300 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-lg">🔴</span>
              <p className="text-sm font-medium text-slate-900">
                Proveedor{highRiskSuppliers.length > 1 ? 'es' : ''} en riesgo alto: <span className="text-red-700">{highRiskSuppliers.join(', ')}</span>
              </p>
            </div>
            <span className="text-red-600 text-sm font-medium">Ver proveedores →</span>
          </Link>
        )}
        {unlinkedMenuItemCount > 0 && (
          <Link href="/analisis" className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-2xl px-5 py-3.5 hover:border-amber-300 transition-colors">
            <div className="flex items-center gap-3">
              <span className="text-lg">🍽</span>
              <p className="text-sm font-medium text-slate-900">
                {unlinkedMenuItemCount} {unlinkedMenuItemCount === 1 ? 'plato sin receta' : 'platos sin receta'} — no se puede calcular su margen
              </p>
            </div>
            <span className="text-amber-700 text-sm font-medium">Costear →</span>
          </Link>
        )}
      </div>

      {/* KPI cards — what matters at 8 AM */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {/* Revenue */}
        <Link href="/operaciones" className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all">
          <p className="text-slate-400 text-xs mb-2">Ventas · últimos 7 días</p>
          {hasOpsData ? (
            <>
              <p className="text-2xl font-bold text-slate-900">{formatCurrency(opsRevenue)}</p>
              {opsAvgTicket && <p className="text-slate-400 text-xs mt-1">ticket prom. {formatCurrency(opsAvgTicket)}</p>}
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-slate-400">—</p>
              <p className="text-slate-400 text-xs mt-1">Importar primer cierre →</p>
            </>
          )}
        </Link>

        {/* Avg margin */}
        <Link href="/analisis" className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all">
          <p className="text-slate-400 text-xs mb-2">Margen bruto promedio</p>
          <p className={`text-2xl font-bold ${getMarginColor(avgMargin)}`}>{costedCount > 0 ? formatPercent(avgMargin) : '—'}</p>
          <p className="text-slate-400 text-xs mt-1">sobre {costedCount} platos costeados</p>
        </Link>

        {/* % costeada */}
        <Link href="/menu/salud" className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all">
          <p className="text-slate-400 text-xs mb-2">Carta costeada</p>
          <p className={`text-2xl font-bold ${pctCosted >= 80 ? 'text-emerald-600' : pctCosted >= 50 ? 'text-yellow-600' : 'text-red-500'}`}>
            {totalMenuItems > 0 ? formatPercent(pctCosted) : '—'}
          </p>
          <p className="text-slate-400 text-xs mt-1">{costedCount} de {totalMenuItems} platos</p>
        </Link>

        {/* AI recommendations */}
        <div
          className={`bg-white border rounded-2xl p-5 cursor-pointer hover:shadow-sm transition-all ${recs.length > 0 ? 'border-indigo-200 hover:border-indigo-300' : 'border-slate-200'}`}
          onClick={() => recs.length > 0 && setActiveRec(recs[0])}
        >
          <p className="text-slate-400 text-xs mb-2">Recomendaciones IA</p>
          <p className={`text-2xl font-bold ${recs.length > 0 ? 'text-indigo-600' : 'text-slate-400'}`}>{pendingRecommendationsCount}</p>
          <p className="text-slate-400 text-xs mt-1">{recs.length > 0 ? 'tap para ver la primera' : 'sin pendientes'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recommendations with actionable CTAs */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900">Recomendaciones IA</h2>
            <Link href="/analisis" className="text-indigo-600 text-sm hover:text-indigo-700">Ver análisis →</Link>
          </div>
          {recs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">✅</p>
              <p className="text-slate-500 text-sm">Sin recomendaciones pendientes</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recs.map(rec => {
                const dest = typeDestination[rec.type] || '/analisis'
                const cta = typeCTA[rec.type] || 'Ver →'
                return (
                  <div key={rec.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-transparent">
                    <div className="flex-1 min-w-0">
                      <p className="text-slate-800 text-sm font-medium leading-snug">{rec.title}</p>
                      <p className="text-slate-500 text-xs mt-0.5 line-clamp-1">{rec.description}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor[rec.priority] || priorityColor.medium}`}>
                          {priorityLabel[rec.priority] || rec.priority}
                        </span>
                        {rec.estimated_impact_pp != null && (
                          <span className="text-emerald-600 text-xs font-semibold">+{rec.estimated_impact_pp} pp</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-col gap-1.5 shrink-0">
                      <Link
                        href={dest}
                        onClick={() => handleRecAction(rec, 'reviewed')}
                        className="text-xs bg-indigo-500 hover:bg-indigo-600 text-white px-3 py-1.5 rounded-lg font-medium transition-colors whitespace-nowrap"
                      >
                        {cta}
                      </Link>
                      <button
                        onClick={() => handleRecAction(rec, 'dismissed')}
                        className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        Descartar
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-semibold text-slate-900 mb-5">Acciones rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/facturas/subir', icon: '📤', label: 'Subir factura', sub: 'OCR automático' },
              { href: '/operaciones/importar', icon: '📊', label: 'Importar cierre', sub: 'ventas del día' },
              { href: '/recetas/importar', icon: '🍽', label: 'Importar recetas', sub: 'costear la carta' },
              { href: '/recetas/nueva', icon: '➕', label: 'Nueva receta', sub: 'desde cero' },
              { href: '/menu/importar', icon: '📋', label: 'Importar carta', sub: 'menú completo' },
              { href: '/ingredientes', icon: '✏️', label: 'Actualizar precios', sub: 'ingredientes' },
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

      {/* Recommendation drawer */}
      {activeRec && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4" onClick={() => setActiveRec(null)}>
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex items-start justify-between mb-4">
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${priorityColor[activeRec.priority] || priorityColor.medium}`}>
                  {priorityLabel[activeRec.priority] || activeRec.priority} prioridad
                </span>
                <button onClick={() => setActiveRec(null)} className="text-slate-400 hover:text-slate-600 text-xl leading-none">×</button>
              </div>
              <h3 className="text-slate-900 font-bold text-lg mb-2">{activeRec.title}</h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-5">{activeRec.description}</p>
              {activeRec.estimated_impact_pp != null && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl mb-5">
                  <span className="text-emerald-600 font-bold">+{activeRec.estimated_impact_pp} pp</span>
                  <span className="text-emerald-600 text-sm">de mejora estimada en margen</span>
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => handleRecAction(activeRec, 'dismissed')}
                  disabled={acting}
                  className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-50 transition-colors"
                >
                  Descartar
                </button>
                <Link
                  href={typeDestination[activeRec.type] || '/analisis'}
                  onClick={() => handleRecAction(activeRec, 'reviewed')}
                  className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors text-center"
                >
                  {typeCTA[activeRec.type] || 'Ir →'}
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
