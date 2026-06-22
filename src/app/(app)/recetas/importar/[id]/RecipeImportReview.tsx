'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Ingredient { id: string; name: string; unit: string; current_price: number }
interface RawIngredient { name: string; quantity: number | null; unit: string; matched_ingredient_id: string | null; confidence: number; corrected: boolean }
interface ImportItem {
  id: string
  proposed_name: string
  proposed_sale_price: number | null
  proposed_portions: number
  confidence: number
  status: string
  matched_recipe_id: string | null
  raw_ingredients: RawIngredient[]
}

interface Props {
  importId: string
  importRow: any
  items: ImportItem[]
  ingredients: Ingredient[]
}

const confidenceColor = (c: number) => c >= 80 ? 'text-emerald-600' : c >= 60 ? 'text-yellow-600' : 'text-red-500'

export default function RecipeImportReview({ importId, importRow, items: initialItems, ingredients }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [createdCount, setCreatedCount] = useState(0)
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id || null)

  const confirmedCount = items.filter(i => i.status === 'confirmed').length
  const rejectedCount = items.filter(i => i.status === 'rejected').length

  async function updateItem(itemId: string, patch: Partial<ImportItem>) {
    const res = await fetch(`/api/recipes/import/${importId}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, ...patch }),
    })
    if (res.ok) {
      setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...patch } : i))
    }
  }

  async function handleConfirmAll() {
    setConfirming(true)
    // First confirm all pending items
    for (const item of items.filter(i => i.status === 'pending')) {
      await updateItem(item.id, { status: 'confirmed' })
    }
    const res = await fetch(`/api/recipes/import/${importId}/confirm`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setCreatedCount(data.created)
      setDone(true)
    }
    setConfirming(false)
  }

  async function handleConfirmSelected() {
    setConfirming(true)
    const res = await fetch(`/api/recipes/import/${importId}/confirm`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setCreatedCount(data.created)
      setDone(true)
    }
    setConfirming(false)
  }

  if (done) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-4">🎉</p>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{createdCount} {createdCount === 1 ? 'receta creada' : 'recetas creadas'}</h2>
        <p className="text-slate-500 mb-8">Los ingredientes sin match fueron creados como borradores. Revisalos en Ingredient Master para completar sus precios.</p>
        <div className="flex justify-center gap-4">
          <Link href="/recetas" className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium">
            Ver recetas
          </Link>
          <Link href="/ingredientes?status=draft" className="border border-slate-200 text-slate-600 px-6 py-2.5 rounded-xl font-medium hover:bg-slate-50">
            Completar ingredientes
          </Link>
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Header + actions */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revisión de recetas importadas</h1>
          <p className="text-slate-500 mt-1">
            <span className="font-medium">{items.length} recetas detectadas</span> · Confianza OCR: <span className={confidenceColor(importRow.ocr_confidence || 0)}>{importRow.ocr_confidence || 0}%</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-slate-400 text-sm">{confirmedCount} confirmadas · {rejectedCount} rechazadas</span>
          <button
            onClick={handleConfirmSelected}
            disabled={confirmedCount === 0 || confirming}
            className="border border-slate-200 text-slate-600 px-4 py-2 rounded-xl text-sm font-medium hover:bg-slate-50 disabled:opacity-40"
          >
            Confirmar seleccionadas ({confirmedCount})
          </button>
          <button
            onClick={handleConfirmAll}
            disabled={confirming}
            className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-sm font-medium transition-colors"
          >
            {confirming ? 'Creando...' : 'Confirmar todas'}
          </button>
        </div>
      </div>

      {/* Recipe cards */}
      <div className="space-y-3">
        {items.map(item => (
          <div
            key={item.id}
            className={`bg-white border rounded-2xl overflow-hidden transition-colors ${
              item.status === 'confirmed' ? 'border-emerald-200' :
              item.status === 'rejected' ? 'border-slate-100 opacity-50' :
              'border-slate-200'
            }`}
          >
            {/* Row header */}
            <div
              className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50"
              onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
            >
              {/* Status toggle */}
              <div className="flex gap-2 shrink-0">
                <button
                  onClick={e => { e.stopPropagation(); updateItem(item.id, { status: item.status === 'confirmed' ? 'pending' : 'confirmed' }) }}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs transition-colors ${
                    item.status === 'confirmed' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                  }`}
                  title="Confirmar"
                >
                  {item.status === 'confirmed' && '✓'}
                </button>
                <button
                  onClick={e => { e.stopPropagation(); updateItem(item.id, { status: item.status === 'rejected' ? 'pending' : 'rejected' }) }}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs transition-colors ${
                    item.status === 'rejected' ? 'border-red-400 bg-red-100 text-red-500' : 'border-slate-300'
                  }`}
                  title="Rechazar"
                >
                  {item.status === 'rejected' && '×'}
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-slate-900">{item.proposed_name}</p>
                  {item.matched_recipe_id && (
                    <span className="text-xs px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full font-medium">Posible duplicado</span>
                  )}
                  <span className={`text-xs font-medium ${confidenceColor(item.confidence || 0)}`}>{item.confidence || 0}% confianza</span>
                </div>
                <p className="text-slate-400 text-sm">{item.raw_ingredients?.length || 0} ingredientes · {item.proposed_portions} porción{item.proposed_portions !== 1 ? 'es' : ''}</p>
              </div>

              {item.proposed_sale_price && (
                <p className="text-slate-700 font-semibold shrink-0">${item.proposed_sale_price.toLocaleString('es-AR')}</p>
              )}

              <span className="text-slate-300 text-sm shrink-0">{expandedId === item.id ? '▲' : '▼'}</span>
            </div>

            {/* Expanded ingredient detail */}
            {expandedId === item.id && (
              <div className="border-t border-slate-100 px-5 py-4 bg-slate-50">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Nombre del plato</label>
                    <input
                      defaultValue={item.proposed_name}
                      onBlur={e => e.target.value !== item.proposed_name && updateItem(item.id, { proposed_name: e.target.value })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Precio de venta ($)</label>
                    <input
                      type="number"
                      defaultValue={item.proposed_sale_price || ''}
                      onBlur={e => updateItem(item.id, { proposed_sale_price: parseFloat(e.target.value) || null })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Porciones</label>
                    <input
                      type="number"
                      defaultValue={item.proposed_portions}
                      onBlur={e => updateItem(item.id, { proposed_portions: parseInt(e.target.value) || 1 })}
                      className="w-full border border-slate-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>

                <p className="text-xs font-medium text-slate-500 mb-2 uppercase tracking-wide">Ingredientes detectados</p>
                <div className="space-y-1.5">
                  {(item.raw_ingredients || []).map((ing, idx) => {
                    const matched = ingredients.find(i => i.id === ing.matched_ingredient_id)
                    return (
                      <div key={idx} className="flex items-center gap-3 p-2 bg-white rounded-lg border border-slate-100">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${ing.matched_ingredient_id ? 'bg-emerald-400' : 'bg-yellow-400'}`} title={ing.matched_ingredient_id ? 'Match encontrado' : 'Ingrediente nuevo'} />
                        <p className="text-sm text-slate-700 flex-1">{ing.name}</p>
                        {matched && <p className="text-xs text-emerald-600">→ {matched.name}</p>}
                        <p className="text-sm font-medium text-slate-600 shrink-0">{ing.quantity} {ing.unit}</p>
                      </div>
                    )
                  })}
                </div>
                {item.matched_recipe_id && (
                  <div className="mt-3 p-3 bg-yellow-50 border border-yellow-200 rounded-xl text-sm">
                    <p className="text-yellow-800 font-medium">⚠️ Posible duplicado detectado</p>
                    <p className="text-yellow-700 text-xs mt-0.5">Esta receta puede ya existir en el sistema. Si confirmás, se creará una nueva versión separada. Si rechazás, no se crea nada.</p>
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
