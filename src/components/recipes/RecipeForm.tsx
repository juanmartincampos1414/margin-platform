'use client'

import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { formatCurrency, formatPercent, getMarginColor } from '@/lib/utils'

interface Ingredient {
  id: string
  name: string
  unit: string
  current_price: number
  brand?: string
}

interface LineItem {
  ingredient_id: string
  name: string
  quantity: number
  unit: string
  current_price: number
  base_unit: string
}

interface Props {
  ingredients: Ingredient[]
  restaurantId?: string
  recipe?: any
}

const UNIT_OPTIONS = ['gr', 'kg', 'ml', 'lt', 'un', 'doc']

function calcLineCost(li: LineItem): number {
  const ratio = (li.unit === 'gr' && li.base_unit === 'kg') ||
                (li.unit === 'ml' && li.base_unit === 'lt') ? 1000 : 1
  return li.quantity * li.current_price / ratio
}

export default function RecipeForm({ ingredients, restaurantId, recipe }: Props) {
  const router = useRouter()
  const [name, setName] = useState(recipe?.name || '')
  const [salePrice, setSalePrice] = useState(recipe?.sale_price || '')
  const [servings, setServings] = useState(recipe?.servings || 1)
  const [status, setStatus] = useState(recipe?.status || 'active')
  const [search, setSearch] = useState('')
  const [lines, setLines] = useState<LineItem[]>(recipe?.recipe_ingredients?.map((ri: any) => ({
    ingredient_id: ri.ingredient_id,
    name: ri.ingredients?.name || '',
    quantity: ri.quantity,
    unit: ri.unit,
    current_price: ri.ingredients?.current_price || 0,
    base_unit: ri.ingredients?.unit || 'kg',
  })) || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filteredIngredients = ingredients.filter(i =>
    !lines.find(l => l.ingredient_id === i.id) &&
    i.name.toLowerCase().includes(search.toLowerCase())
  )

  const totalCost = useMemo(() => lines.reduce((s, l) => s + calcLineCost(l), 0), [lines])
  const price = parseFloat(String(salePrice)) || 0
  const grossMargin = price > 0 ? ((price - totalCost) / price) * 100 : 0

  function addIngredient(ing: Ingredient) {
    setLines(prev => [...prev, {
      ingredient_id: ing.id,
      name: ing.name,
      quantity: 100,
      unit: ing.unit === 'kg' ? 'gr' : ing.unit === 'lt' ? 'ml' : ing.unit,
      current_price: ing.current_price,
      base_unit: ing.unit,
    }])
    setSearch('')
  }

  function updateLine(idx: number, field: keyof LineItem, value: any) {
    setLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l))
  }

  function removeLine(idx: number) {
    setLines(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSave() {
    if (!name || !restaurantId) return
    setSaving(true)
    setError('')
    const supabase = createClient()

    try {
      if (recipe?.id) {
        await supabase.from('recipes').update({ name, sale_price: price, servings, status }).eq('id', recipe.id)
        await supabase.from('recipe_ingredients').delete().eq('recipe_id', recipe.id)
        if (lines.length > 0) {
          await supabase.from('recipe_ingredients').insert(
            lines.map(l => ({ recipe_id: recipe.id, ingredient_id: l.ingredient_id, quantity: l.quantity, unit: l.unit }))
          )
        }
        router.push(`/recetas/${recipe.id}`)
      } else {
        const { data: newRecipe } = await supabase
          .from('recipes')
          .insert({ restaurant_id: restaurantId, name, sale_price: price, servings, status })
          .select()
          .single()
        if (newRecipe && lines.length > 0) {
          await supabase.from('recipe_ingredients').insert(
            lines.map(l => ({ recipe_id: newRecipe.id, ingredient_id: l.ingredient_id, quantity: l.quantity, unit: l.unit }))
          )
        }
        router.push('/recetas')
      }
      router.refresh()
    } catch (e: any) {
      setError(e.message)
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {/* Basic info */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
        <h2 className="font-semibold text-slate-900">Información del plato</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre del plato</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Ej: Milanesa Napolitana" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio de venta</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">$</span>
              <input type="number" value={salePrice} onChange={e => setSalePrice(e.target.value)} placeholder="12.900" className="w-full border border-slate-300 rounded-lg pl-7 pr-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Porciones</label>
            <input type="number" min="1" value={servings} onChange={e => setServings(parseInt(e.target.value))} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
          </div>
        </div>
      </div>

      {/* Ingredients */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Ingredientes</h2>

        {/* Search */}
        <div className="relative mb-4">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ingrediente..."
            className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
          />
          {search && filteredIngredients.length > 0 && (
            <div className="absolute top-full left-0 right-0 bg-white border border-slate-200 rounded-xl mt-1 shadow-lg z-10 max-h-48 overflow-auto">
              {filteredIngredients.slice(0, 8).map(ing => (
                <button
                  key={ing.id}
                  onClick={() => addIngredient(ing)}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-slate-50 text-left"
                >
                  <span className="text-slate-800 text-sm">{ing.name} {ing.brand && <span className="text-slate-400">· {ing.brand}</span>}</span>
                  <span className="text-slate-500 text-xs">{formatCurrency(ing.current_price)}/{ing.unit}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Lines */}
        {lines.length > 0 && (
          <div>
            <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-500 mb-2 px-1">
              <span className="col-span-4">Ingrediente</span>
              <span className="col-span-2">Cantidad</span>
              <span className="col-span-2">Unidad</span>
              <span className="col-span-2">Costo/u</span>
              <span className="col-span-1">Total</span>
              <span className="col-span-1"></span>
            </div>
            <div className="space-y-2">
              {lines.map((li, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <span className="col-span-4 text-sm text-slate-800 truncate">{li.name}</span>
                  <input
                    type="number"
                    value={li.quantity}
                    onChange={e => updateLine(idx, 'quantity', parseFloat(e.target.value) || 0)}
                    className="col-span-2 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  />
                  <select
                    value={li.unit}
                    onChange={e => updateLine(idx, 'unit', e.target.value)}
                    className="col-span-2 border border-slate-200 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    {UNIT_OPTIONS.map(u => <option key={u}>{u}</option>)}
                  </select>
                  <span className="col-span-2 text-xs text-slate-500">{formatCurrency(li.current_price)}/{li.base_unit}</span>
                  <span className="col-span-1 text-sm font-medium text-slate-800">{formatCurrency(calcLineCost(li))}</span>
                  <button onClick={() => removeLine(idx)} className="col-span-1 text-slate-400 hover:text-red-500 text-center transition-colors">×</button>
                </div>
              ))}
            </div>
          </div>
        )}

        {lines.length === 0 && (
          <div className="text-center py-8 text-slate-400 text-sm">
            Buscá y agregá ingredientes desde arriba
          </div>
        )}
      </div>

      {/* Cost summary */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <h2 className="font-semibold text-slate-900 mb-4">Resumen de costos</h2>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-slate-400 text-xs mb-1">Costo total receta</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(totalCost)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">Precio de venta</p>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(price)}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs mb-1">Margen bruto</p>
            <p className={`text-2xl font-bold ${getMarginColor(grossMargin)}`}>{formatPercent(grossMargin)}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-3">
        <button onClick={() => router.back()} className="px-4 py-2.5 text-sm text-slate-600 hover:text-slate-800">Cancelar</button>
        <button onClick={handleSave} disabled={saving || !name} className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-medium transition-colors">
          {saving ? 'Guardando...' : 'Guardar receta'}
        </button>
      </div>
    </div>
  )
}
