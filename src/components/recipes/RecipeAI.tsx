'use client'

import { useState } from 'react'
import { formatPercent } from '@/lib/utils'

interface Props {
  recipeId: string
  recipeName: string
  totalCost: number
  salePrice: number
  grossMargin: number
  ingredients: { name: string; cost: number; pct: number }[]
}

interface Recommendation {
  type: string
  title: string
  description: string
  estimated_impact_pp: number
  priority: 'high' | 'medium' | 'low'
}

const priorityColor = { high: 'text-red-600', medium: 'text-yellow-600', low: 'text-slate-500' }
const priorityBg = { high: 'bg-red-50 border-red-200', medium: 'bg-yellow-50 border-yellow-200', low: 'bg-slate-50 border-slate-200' }

export default function RecipeAI({ recipeId, recipeName, totalCost, salePrice, grossMargin, ingredients }: Props) {
  const [recs, setRecs] = useState<Recommendation[]>([])
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  async function generateRecs() {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/ai/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipeId, recipeName, totalCost, salePrice, grossMargin, ingredients }),
      })
      if (!res.ok) throw new Error('Error al generar recomendaciones')
      const data = await res.json()
      setRecs(data.recommendations || [])
      setDone(true)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 h-fit">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-xl">🤖</span>
        <h2 className="font-semibold text-slate-900">Análisis IA</h2>
      </div>

      {!done && !loading && (
        <div className="text-center py-6">
          <p className="text-slate-500 text-sm mb-4">
            Analizá este plato con IA para obtener recomendaciones concretas de mejora.
          </p>
          <button onClick={generateRecs} className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors w-full">
            Analizar con IA
          </button>
        </div>
      )}

      {loading && (
        <div className="text-center py-8">
          <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-slate-500 text-sm">Analizando margen y costos...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {done && recs.length === 0 && (
        <div className="text-center py-6">
          <p className="text-4xl mb-2">✅</p>
          <p className="text-slate-500 text-sm">El margen de este plato está bien optimizado.</p>
        </div>
      )}

      {recs.length > 0 && (
        <div className="space-y-3">
          {recs.map((rec, i) => (
            <div key={i} className={`border rounded-xl p-4 ${priorityBg[rec.priority]}`}>
              <div className="flex items-start justify-between gap-2 mb-1">
                <p className="text-slate-800 text-sm font-medium">{rec.title}</p>
                {rec.estimated_impact_pp > 0 && (
                  <span className="text-emerald-600 font-bold text-sm shrink-0">+{rec.estimated_impact_pp} pp</span>
                )}
              </div>
              <p className="text-slate-600 text-xs leading-relaxed">{rec.description}</p>
              <p className={`text-xs font-medium mt-2 ${priorityColor[rec.priority]}`}>
                {rec.priority === 'high' ? '🔴 Alta prioridad' : rec.priority === 'medium' ? '🟡 Media prioridad' : '⚪ Baja prioridad'}
              </p>
            </div>
          ))}
          <button onClick={generateRecs} className="w-full text-indigo-600 hover:text-indigo-700 text-xs py-2 border border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors">
            Regenerar análisis
          </button>
        </div>
      )}
    </div>
  )
}
