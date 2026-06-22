'use client'

import Link from 'next/link'
import { formatCurrency, formatPercent, getMarginColor } from '@/lib/utils'

interface Props {
  restaurantName: string
  recipes: { id: string; name: string; sale_price: number; status: string }[]
  ingredientCount: number
  recentInvoices: { id: string; status: string }[]
  recommendations: { id: string; title: string; type: string; estimated_impact_pp: number; priority: string }[]
  avgMargin: number
  pctCosted: number
  invoicesToReview: number
  pendingRecommendationsCount: number
}

const priorityColor: Record<string, string> = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-slate-100 text-slate-600',
}

export default function DashboardContent({ restaurantName, recipes, ingredientCount, recentInvoices, recommendations, avgMargin, pctCosted, invoicesToReview, pendingRecommendationsCount }: Props) {
  return (
    <div className="p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-500 mt-1">{restaurantName} · Últimos 30 días</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">📈</span>
          </div>
          <p className={`text-3xl font-bold ${getMarginColor(avgMargin)}`}>{formatPercent(avgMargin)}</p>
          <p className="text-slate-500 text-sm mt-0.5">Margen promedio</p>
          <p className="text-slate-400 text-xs mt-0.5">sobre {formatPercent(pctCosted)} de la carta costeada</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">🥩</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{ingredientCount}</p>
          <p className="text-slate-500 text-sm mt-0.5">Ingredientes</p>
          <p className="text-slate-400 text-xs mt-0.5">registrados</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">⚠️</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{invoicesToReview}</p>
          <p className="text-slate-500 text-sm mt-0.5">Facturas</p>
          <p className="text-slate-400 text-xs mt-0.5">requieren revisión</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <div className="flex items-start justify-between mb-3">
            <span className="text-2xl">🤖</span>
          </div>
          <p className="text-3xl font-bold text-slate-900">{pendingRecommendationsCount}</p>
          <p className="text-slate-500 text-sm mt-0.5">Recomendaciones</p>
          <p className="text-slate-400 text-xs mt-0.5">pendientes</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recommendations */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900">Recomendaciones IA</h2>
            <Link href="/analisis" className="text-indigo-600 text-sm hover:text-indigo-700">Ver todas →</Link>
          </div>
          {recommendations.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-4xl mb-3">🎉</p>
              <p className="text-slate-500 text-sm">No hay recomendaciones pendientes</p>
            </div>
          ) : (
            <div className="space-y-3">
              {recommendations.map(rec => (
                <div key={rec.id} className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-800 text-sm font-medium truncate">{rec.title}</p>
                    <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium ${priorityColor[rec.priority] || priorityColor.medium}`}>
                      {rec.priority === 'high' ? 'Alta' : rec.priority === 'medium' ? 'Media' : 'Baja'} prioridad
                    </span>
                  </div>
                  {rec.estimated_impact_pp && (
                    <div className="text-emerald-600 font-bold text-sm shrink-0">
                      +{rec.estimated_impact_pp} pp
                    </div>
                  )}
                </div>
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
              { href: '/ingredientes', icon: '✏️', label: 'Actualizar precios' },
              { href: '/menu', icon: '🍽', label: 'Menu Intelligence' },
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

      {/* Recent recipes */}
      {recipes.length > 0 && (
        <div className="mt-6 bg-white border border-slate-200 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-semibold text-slate-900">Platos recientes</h2>
            <Link href="/recetas" className="text-indigo-600 text-sm hover:text-indigo-700">Ver todos →</Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recipes.slice(0, 5).map(recipe => (
              <div key={recipe.id} className="flex items-center justify-between py-3">
                <Link href={`/recetas/${recipe.id}`} className="text-slate-800 text-sm font-medium hover:text-indigo-600 transition-colors">
                  {recipe.name}
                </Link>
                <span className="text-slate-500 text-sm">{formatCurrency(recipe.sale_price)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
