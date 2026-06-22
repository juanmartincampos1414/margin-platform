'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

interface Ingredient { id: string; name: string; unit: string; current_price: number }
interface MenuItem { id: string; name: string; recipe_id: string | null }
interface RawIngredient {
  name: string
  quantity: number | null
  unit: string
  matched_ingredient_id: string | null
  confidence: number
  corrected: boolean
}
interface ImportItem {
  id: string
  proposed_name: string
  proposed_sale_price: number | null
  proposed_portions: number
  confidence: number
  status: string
  matched_recipe_id: string | null
  matched_menu_item_id: string | null
  menu_match_confidence: number | null
  raw_ingredients: RawIngredient[]
}

interface Props {
  importId: string
  importRow: any
  items: ImportItem[]
  ingredients: Ingredient[]
  menuItems: MenuItem[]
}

export default function RecipeImportReview({ importId, importRow, items: initialItems, ingredients, menuItems }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initialItems)
  const [confirming, setConfirming] = useState(false)
  const [done, setDone] = useState(false)
  const [result, setResult] = useState<{ created: number; linked_to_menu: number } | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(items[0]?.id || null)

  // Local overrides: user can change the menu item suggestion before confirming
  const [menuOverrides, setMenuOverrides] = useState<Record<string, string | null>>({})

  const confirmedCount = items.filter(i => i.status === 'confirmed').length
  const pendingCount = items.filter(i => i.status === 'pending').length

  const menuById = new Map(menuItems.map(m => [m.id, m]))
  const ingredientById = new Map(ingredients.map(i => [i.id, i]))

  async function updateItem(itemId: string, patch: Partial<ImportItem>) {
    const res = await fetch(`/api/recipes/import/${importId}/items`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId, ...patch }),
    })
    if (res.ok) setItems(prev => prev.map(i => i.id === itemId ? { ...i, ...patch } : i))
  }

  async function handleConfirmSelected() {
    setConfirming(true)
    // Apply menu overrides before confirming
    for (const item of items.filter(i => i.status === 'confirmed')) {
      if (menuOverrides[item.id] !== undefined) {
        await fetch(`/api/recipes/import/${importId}/items`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ itemId: item.id, matched_menu_item_id: menuOverrides[item.id] }),
        })
      }
    }
    const res = await fetch(`/api/recipes/import/${importId}/confirm`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setResult({ created: data.created, linked_to_menu: data.linked_to_menu })
      setDone(true)
    }
    setConfirming(false)
  }

  async function handleConfirmAll() {
    setConfirming(true)
    for (const item of items.filter(i => i.status === 'pending')) {
      await updateItem(item.id, { status: 'confirmed' })
    }
    // Apply menu overrides
    for (const [itemId, menuItemId] of Object.entries(menuOverrides)) {
      await fetch(`/api/recipes/import/${importId}/items`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, matched_menu_item_id: menuItemId }),
      })
    }
    const res = await fetch(`/api/recipes/import/${importId}/confirm`, { method: 'POST' })
    const data = await res.json()
    if (res.ok) {
      setResult({ created: data.created, linked_to_menu: data.linked_to_menu })
      setDone(true)
    }
    setConfirming(false)
  }

  if (done && result) {
    return (
      <div className="text-center py-16">
        <p className="text-5xl mb-4">✅</p>
        <h2 className="text-2xl font-bold text-slate-900 mb-2">{result.created} {result.created === 1 ? 'receta creada' : 'recetas creadas'}</h2>
        {result.linked_to_menu > 0 && (
          <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2 mb-6">
            <span className="text-emerald-600 font-semibold">+{result.linked_to_menu} platos costeados</span>
            <span className="text-emerald-500 text-sm">— el % carta costeada subió en el dashboard</span>
          </div>
        )}
        <div className="flex items-center justify-center gap-4 mt-4">
          <Link href="/recetas" className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 py-2.5 rounded-xl font-medium transition-colors">
            Ver recetas →
          </Link>
          <Link href="/menu" className="border border-slate-200 hover:border-slate-300 text-slate-700 px-6 py-2.5 rounded-xl font-medium transition-colors">
            Ver carta →
          </Link>
          {result.created - result.linked_to_menu > 0 && (
            <Link href="/ingredientes" className="border border-slate-200 hover:border-slate-300 text-slate-700 px-6 py-2.5 rounded-xl font-medium transition-colors">
              Completar ingredientes →
            </Link>
          )}
        </div>
      </div>
    )
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Revisión de recetas importadas</h1>
          <p className="text-slate-500 mt-1">
            {items.length} {items.length === 1 ? 'receta detectada' : 'recetas detectadas'}
            {' · '}Confianza OCR:{' '}
            <span className={`font-medium ${(importRow.ocr_confidence || 0) >= 80 ? 'text-emerald-600' : 'text-yellow-600'}`}>
              {importRow.ocr_confidence || 0}%
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {confirmedCount > 0 && (
            <button
              onClick={handleConfirmSelected}
              disabled={confirming}
              className="border border-indigo-300 text-indigo-600 hover:bg-indigo-50 px-4 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
            >
              {confirming ? '...' : `Confirmar ${confirmedCount} seleccionada${confirmedCount !== 1 ? 's' : ''}`}
            </button>
          )}
          <button
            onClick={handleConfirmAll}
            disabled={confirming || items.length === 0}
            className="bg-indigo-500 hover:bg-indigo-600 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors disabled:opacity-50"
          >
            {confirming ? 'Confirmando...' : `Confirmar todas (${items.length})`}
          </button>
        </div>
      </div>

      {/* Recipe cards */}
      <div className="space-y-3">
        {items.map(item => {
          const matchedMenuItemId = menuOverrides[item.id] !== undefined ? menuOverrides[item.id] : item.matched_menu_item_id
          const matchedMenuItem = matchedMenuItemId ? menuById.get(matchedMenuItemId) : null
          const matchConfidence = menuOverrides[item.id] !== undefined
            ? (menuOverrides[item.id] ? 100 : null)
            : item.menu_match_confidence

          const rawIngs: RawIngredient[] = item.raw_ingredients || []
          const matchedIngs = rawIngs.filter(i => i.matched_ingredient_id)
          const missingIngs = rawIngs.filter(i => !i.matched_ingredient_id)

          return (
            <div key={item.id} className={`bg-white border rounded-2xl overflow-hidden transition-colors ${
              item.status === 'confirmed' ? 'border-emerald-300' : item.status === 'rejected' ? 'border-slate-200 opacity-50' : 'border-slate-200'
            }`}>
              {/* Card header */}
              <div
                className="flex items-center gap-4 px-5 py-4 cursor-pointer hover:bg-slate-50"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                {/* Status toggle */}
                <button
                  onClick={e => { e.stopPropagation(); updateItem(item.id, { status: item.status === 'confirmed' ? 'pending' : 'confirmed' }) }}
                  className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                    item.status === 'confirmed' ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-slate-300 hover:border-emerald-400'
                  }`}
                  title={item.status === 'confirmed' ? 'Quitar selección' : 'Confirmar esta receta'}
                >
                  {item.status === 'confirmed' && <span className="text-xs">✓</span>}
                </button>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-slate-900">{item.proposed_name}</p>
                    {item.matched_recipe_id && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Duplicado detectado</span>
                    )}
                  </div>

                  {/* Menu match suggestion */}
                  {matchedMenuItem ? (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-emerald-600 text-xs">→ Plato en carta:</span>
                      <span className="text-xs font-medium text-emerald-700">{matchedMenuItem.name}</span>
                      {matchConfidence && (
                        <span className="text-xs text-emerald-500">{Math.round(matchConfidence)}% match</span>
                      )}
                      <button
                        onClick={e => { e.stopPropagation(); setMenuOverrides(prev => ({ ...prev, [item.id]: null })) }}
                        className="text-xs text-slate-400 hover:text-red-500 ml-1"
                        title="Quitar vinculación"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-400 mt-1">Sin match en carta</p>
                  )}
                </div>

                <div className="flex items-center gap-4 text-sm shrink-0">
                  {item.proposed_sale_price && (
                    <span className="text-slate-600">${item.proposed_sale_price.toLocaleString('es-AR')}</span>
                  )}
                  <span className="text-xs text-slate-400">{rawIngs.length} ing.</span>
                  {missingIngs.length > 0 && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                      {missingIngs.length} faltante{missingIngs.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); updateItem(item.id, { status: 'rejected' }) }}
                    className="text-xs text-slate-400 hover:text-red-500 transition-colors"
                    title="Rechazar"
                  >
                    ✕
                  </button>
                  <span className="text-slate-300 text-xs">{expandedId === item.id ? '▲' : '▼'}</span>
                </div>
              </div>

              {/* Expanded detail */}
              {expandedId === item.id && (
                <div className="border-t border-slate-100 px-5 py-4 bg-slate-50 space-y-4">

                  {/* Menu item override */}
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">Plato de la carta a costear</p>
                    <select
                      className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 w-full max-w-sm"
                      value={matchedMenuItemId || ''}
                      onChange={e => setMenuOverrides(prev => ({ ...prev, [item.id]: e.target.value || null }))}
                    >
                      <option value="">— Sin vincular —</option>
                      {menuItems.filter(m => !m.recipe_id || m.id === matchedMenuItemId).map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                    <p className="text-xs text-slate-400 mt-1">Solo aparecen platos sin receta vinculada. Al confirmar, este plato quedará costeado.</p>
                  </div>

                  {/* Matched ingredients */}
                  {matchedIngs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">
                        Ingredientes reconocidos ({matchedIngs.length})
                      </p>
                      <div className="space-y-1">
                        {matchedIngs.map((ing, i) => {
                          const existingIng = ingredientById.get(ing.matched_ingredient_id!)
                          return (
                            <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-white rounded-lg border border-slate-100">
                              <div className="flex items-center gap-2">
                                <span className="text-emerald-500 text-xs">✓</span>
                                <span className="text-sm text-slate-700">{ing.name}</span>
                                {existingIng && (
                                  <span className="text-xs text-slate-400">→ {existingIng.name}</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-500">
                                {ing.quantity && <span>{ing.quantity} {ing.unit}</span>}
                                {existingIng && (existingIng.current_price ?? 0) > 0 && (
                                  <span className="text-slate-400">${(existingIng.current_price ?? 0).toLocaleString('es-AR')}/{existingIng.unit}</span>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Missing ingredients */}
                  {missingIngs.length > 0 && (
                    <div>
                      <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-2">
                        Ingredientes faltantes ({missingIngs.length}) — se crearán como borrador al confirmar
                      </p>
                      <div className="space-y-1">
                        {missingIngs.map((ing, i) => (
                          <div key={i} className="flex items-center justify-between py-1.5 px-3 bg-amber-50 rounded-lg border border-amber-100">
                            <div className="flex items-center gap-2">
                              <span className="text-amber-500 text-xs">⚠</span>
                              <span className="text-sm text-slate-700">{ing.name}</span>
                              <span className="text-xs text-slate-400">{ing.quantity} {ing.unit}</span>
                            </div>
                            <span className="text-xs text-amber-600">sin precio — completar en Ingredientes</span>
                          </div>
                        ))}
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        Estos ingredientes se crean sin precio. Podés completarlos desde{' '}
                        <Link href="/ingredientes" className="text-indigo-600 hover:underline">Ingredientes</Link>{' '}
                        o subirlos con la próxima factura OCR.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </>
  )
}
