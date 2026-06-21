'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'

interface Ingredient {
  id: string
  name: string
  normalized_name?: string
  brand?: string
  unit: string
  current_price: number
  stock_level: string
  status: string
  suppliers?: { id: string; name: string } | null
}

interface Props {
  ingredients: Ingredient[]
  restaurantId?: string
}

const UNITS = ['kg', 'gr', 'lt', 'ml', 'un', 'doc']
const stockColors: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-orange-100 text-orange-700',
  out: 'bg-red-100 text-red-700',
}
const stockLabels: Record<string, string> = { high: 'Alto', medium: 'Medio', low: 'Bajo', out: 'Sin stock' }
const statusColors: Record<string, string> = {
  draft: 'bg-orange-100 text-orange-700',
  validated: 'bg-emerald-100 text-emerald-700',
  merged: 'bg-slate-100 text-slate-500',
  archived: 'bg-slate-100 text-slate-400',
}
const statusLabels: Record<string, string> = { draft: 'Borrador', validated: 'Validado', merged: 'Fusionado', archived: 'Archivado' }

export default function IngredientsClient({ ingredients: initial, restaurantId }: Props) {
  const router = useRouter()
  const [ingredients, setIngredients] = useState(initial)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', brand: '', unit: 'kg', current_price: '', stock_level: 'medium' })
  const [saving, setSaving] = useState(false)

  const filtered = ingredients.filter(i =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.brand || '').toLowerCase().includes(search.toLowerCase())
  )

  function openNew() {
    setForm({ name: '', brand: '', unit: 'kg', current_price: '', stock_level: 'medium' })
    setEditingId(null)
    setShowForm(true)
  }

  function openEdit(ing: Ingredient) {
    setForm({ name: ing.name, brand: ing.brand || '', unit: ing.unit, current_price: String(ing.current_price), stock_level: ing.stock_level })
    setEditingId(ing.id)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name || !restaurantId) return
    setSaving(true)
    const payload = { name: form.name, brand: form.brand || null, unit: form.unit, current_price: parseFloat(form.current_price) || 0, stock_level: form.stock_level }

    if (editingId) {
      const res = await fetch(`/api/ingredients/${editingId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, status: 'validated' }),
      })
      const data = await res.json()
      if (res.ok) setIngredients(prev => prev.map(i => i.id === editingId ? { ...i, ...data } : i))
    } else {
      const res = await fetch('/api/ingredients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (res.ok) setIngredients(prev => [...prev, data])
    }
    setSaving(false)
    setShowForm(false)
    router.refresh()
  }

  async function handleDelete(id: string) {
    if (!confirm('¿Archivar este ingrediente? Las recetas y facturas que ya lo usan no se ven afectadas.')) return
    const res = await fetch(`/api/ingredients/${id}`, { method: 'DELETE' })
    if (res.ok) setIngredients(prev => prev.filter(i => i.id !== id))
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Ingredientes</h1>
          <p className="text-slate-500 mt-1">{ingredients.length} ingredientes registrados</p>
        </div>
        <button onClick={openNew} className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          + Nuevo ingrediente
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar ingrediente o marca..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🥩</p>
            <p className="text-slate-500 text-sm">No hay ingredientes aún. Agregá el primero.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Ingrediente</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Proveedor</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Unidad</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Precio/unidad</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Estado</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Stock</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(ing => (
                <tr key={ing.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{ing.name}</p>
                    {ing.normalized_name && ing.normalized_name !== ing.name && (
                      <p className="text-slate-400 text-xs">→ {ing.normalized_name}</p>
                    )}
                    {ing.brand && <p className="text-slate-400 text-xs">{ing.brand}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{ing.suppliers?.name || '—'}</td>
                  <td className="px-4 py-3 text-right text-slate-600">{ing.unit}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(ing.current_price)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[ing.status] || statusColors.draft}`}>
                      {statusLabels[ing.status] || ing.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${stockColors[ing.stock_level] || stockColors.medium}`}>
                      {stockLabels[ing.stock_level] || ing.stock_level}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button onClick={() => openEdit(ing)} className="text-slate-400 hover:text-indigo-600 transition-colors text-sm">Editar</button>
                      <button onClick={() => handleDelete(ing.id)} className="text-slate-400 hover:text-red-500 transition-colors text-sm">Archivar</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-slate-900 text-lg mb-5">{editingId ? 'Editar' : 'Nuevo'} ingrediente</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre *</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Carne de nalga" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Marca</label>
                <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} placeholder="Opcional" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Unidad</label>
                  <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                    {UNITS.map(u => <option key={u}>{u}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio por unidad ($)</label>
                  <input type="number" value={form.current_price} onChange={e => setForm(f => ({ ...f, current_price: e.target.value }))} placeholder="2.550" className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Stock</label>
                <select value={form.stock_level} onChange={e => setForm(f => ({ ...f, stock_level: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                  <option value="high">Alto</option>
                  <option value="medium">Medio</option>
                  <option value="low">Bajo</option>
                  <option value="out">Sin stock</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowForm(false)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
