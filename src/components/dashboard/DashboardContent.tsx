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
  ingredientCount: number
  recommendations: Recommendation[]
  avgMargin: number
  pctCosted: number
  invoicesToReview: number
  pendingRecommendationsCount: number
  unlinkedMenuItemCount: number
}

const priorityColor: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
}
const priorityLabel: Record<string, string> = { high: 'Alta', medium: 'Media', low: 'Baja' }

const typeDestination: Record<string, string> = {
  negotiate_supplier: '/proveedores',
  adjust_price: '/menu',
  review_ingredient: '/ingredientes',
  menu_mix: '/analisis',
}

const typeLabel: Record<string, string> = {
  negotiate_supplier: 'Proveedores',
  adjust_price: 'Menu Intelligence',
  review_ingredient: 'Ingredientes',
  menu_mix: 'Análisis',
}

export default function DashboardContent({
  restaurantName, ingredientCount, recommendations,
  avgMargin, pctCosted, invoicesToReview,
  pendingRecommendationsCount, unlinkedMenuItemCount,
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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">{restaurantName} · Últimos 30 días</p>
      </div>

      {/* KPI cards — all clickable */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <Link href="/analisis" className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all">
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">📈</span>
          </div>
          <p className={`text-3xl font-bold ${getMarginColor(avgMargin)}`}>{formatPercent(avgMargin)}</p>
          <p className="text-slate-500 text-sm mt-0.5">Margen promedio</p>
          <p className="text-slate-400 text-xs mt-0.5">sobre {formatPercent(pctCosted)} de la carta costeada</p>
        </Link>

        <Link href="/ingredientes" className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-indigo-300 hover:shadow-sm transition-all">
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">🥩</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{ingredientCount}</p>
          <p className="text-slate-500 text-sm mt-0.5">Ingredientes</p>
          <p className="text-slate-400 text-xs mt-0.5">registrados</p>
        </Link>

        <Link
          href="/facturas?status=review_required"
          className={`bg-white border rounded-2xl p-5 hover:shadow-sm transition-all ${invoicesToReview > 0 ? 'border-orange-200 hover:border-orange-300' : 'border-slate-200 hover:border-indigo-300'}`}
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">⚠️</span>
          </div>
          <p className={`text-3xl font-bold ${invoicesToReview > 0 ? 'text-orange-600' : 'text-slate-900'}`}>{invoicesToReview}</p>
          <p className="text-slate-500 text-sm mt-0.5">Facturas</p>
          <p className="text-slate-400 text-xs mt-0.5">requieren revisión</p>
        </Link>

        <div
          className={`bg-white border rounded-2xl p-5 cursor-pointer hover:shadow-sm transition-all ${recs.length > 0 ? 'border-indigo-200 hover:border-indigo-300' : 'border-slate-200 hover:border-slate-300'}`}
          onClick={() => recs.length > 0 && setActiveRec(recs[0])}
        >
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">🤖</span>
          </div>
          <p className={`text-3xl font-bold ${recs.length > 0 ? 'text-indigo-600' : 'text-slate-900'}`}>{pendingRecommendationsCount}</p>
          <p className="text-slate-500 text-sm mt-0.5">Recomendaciones</p>
          <p className="text-slate-400 text-xs mt-0.5">{recs.length > 0 ? 'click para ver' : 'sin pendientes'}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recommendations */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900">Recomendaciones IA</h2>
            <Link href="/analisis" className="text-indigo-600 text-sm hover:text-indigo-700">Ver todas →</Link>
          </div>
          {recs.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">🎉</p>
              <p className="text-slate-500 text-sm">No hay recomendaciones pendientes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recs.map(rec => (
                <button
                  key={rec.id}
                  onClick={() => setActiveRec(rec)}
                  className="w-full flex items-start gap-3 p-3 rounded-xl bg-slate-50 hover:bg-indigo-50 hover:border-indigo-100 border border-transparent transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 text-sm font-medium truncate">{rec.title}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor[rec.priority] || priorityColor.medium}`}>
                      {priorityLabel[rec.priority] || rec.priority} prioridad
                    </span>
                  </div>
                  {rec.estimated_impact_pp != null && (
                    <div className="text-emerald-600 font-bold text-sm shrink-0">
                      +{rec.estimated_impact_pp} pp
                    </div>
                  )}
                  <span className="text-slate-300 text-sm shrink-0">›</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Quick actions */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-semibold text-slate-900 mb-5">Acciones rápidas</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: '/recetas/nueva', icon: '➕', label: 'Nueva receta' },
              { href: '/facturas/subir', icon: '📤', label: 'Subir factura' },
              { href: '/menu/importar', icon: '📋', label: 'Importar carta' },
              { href: '/recetas/importar', icon: '🍽', label: 'Importar recetas' },
              { href: '/operaciones/importar', icon: '📊', label: 'Importar ventas' },
              { href: '/ingredientes', icon: '✏️', label: 'Actualizar precios' },
            ].map(action => (
              <Link
                key={action.href}
                href={action.href}
                className="flex items-center gap-2.5 p-3.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
              >
                <span className="text-xl">{action.icon}</span>
                <span className="text-slate-700 text-sm font-medium">{action.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Platos sin costear — replaces "Platos recientes", only shown when actionable */}
      {unlinkedMenuItemCount > 0 && (
        <div className="mt-6 bg-orange-50 border border-orange-200 rounded-2xl p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-2xl">🍽</span>
            <div>
              <p className="font-semibold text-slate-900">{unlinkedMenuItemCount} {unlinkedMenuItemCount === 1 ? 'plato sin receta vinculada' : 'platos sin receta vinculada'}</p>
              <p className="text-slate-500 text-sm">No podés calcular margen sin receta. Costealos para completar el P&L.</p>
            </div>
          </div>
          <Link href="/menu" className="shrink-0 bg-white border border-orange-200 text-orange-700 px-4 py-2 rounded-xl text-sm font-medium hover:bg-orange-100 transition-colors">
            Ver platos →
          </Link>
        </div>
      )}

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
              <p className="text-slate-600 text-sm leading-relaxed mb-4">{activeRec.description}</p>
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl mb-5">
                <div className="flex-1">
                  <p className="text-xs text-slate-400 mb-0.5">Módulo relacionado</p>
                  <p className="text-sm font-medium text-slate-700">{typeLabel[activeRec.type] || activeRec.type}</p>
                </div>
                {activeRec.estimated_impact_pp != null && (
                  <div className="text-right">
                    <p className="text-xs text-slate-400 mb-0.5">Impacto estimado</p>
                    <p className="text-emerald-600 font-bold text-sm">+{activeRec.estimated_impact_pp} pp margen</p>
                  </div>
                )}
              </div>
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
                  Ir al módulo →
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
