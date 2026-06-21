'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'

interface Category { id: string; name: string }
interface Recipe { id: string; name: string }
interface MenuItem {
  id: string
  name: string
  selling_price: number
  status: string
  menu_categories?: Category | null
  recipes?: Recipe | null
}

interface Props {
  menuItems: MenuItem[]
  categories: Category[]
  recipes: Recipe[]
}

export default function MenuLibraryClient({ menuItems: initial, categories, recipes }: Props) {
  const router = useRouter()
  const [menuItems, setMenuItems] = useState(initial)
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', category_id: '', selling_price: '' })
  const [saving, setSaving] = useState(false)

  const filtered = menuItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
  const grouped = filtered.reduce((acc: Record<string, MenuItem[]>, item) => {
    const key = item.menu_categories?.name || 'Sin categoría'
    acc[key] = acc[key] || []
    acc[key].push(item)
    return acc
  }, {})

  function openEdit(item: MenuItem) {
    setForm({ name: item.name, category_id: item.menu_categories?.id || '', selling_price: String(item.selling_price) })
    setEditingId(item.id)
    setShowForm(true)
  }

  async function handleSave() {
    if (!form.name || !editingId) return
    setSaving(true)
    const payload = {
      name: form.name,
      category_id: form.category_id || null,
      selling_price: parseFloat(form.selling_price) || 0,
    }

    const res = await fetch(`/api/menu/item/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    const data = await res.json()
    if (res.ok) setMenuItems(prev => prev.map(i => i.id === editingId ? data : i))
    setSaving(false)
    setShowForm(false)
    router.refresh()
  }

  async function handleArchive(id: string) {
    if (!confirm('¿Archivar este producto del menú?')) return
    const res = await fetch(`/api/menu/item/${id}`, { method: 'DELETE' })
    if (res.ok) setMenuItems(prev => prev.filter(i => i.id !== id))
  }

  async function handleLinkRecipe(itemId: string, recipeId: string) {
    const res = await fetch(`/api/menu/item/${itemId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipe_id: recipeId || null }),
    })
    const data = await res.json()
    if (res.ok) setMenuItems(prev => prev.map(i => i.id === itemId ? data : i))
    setLinkingId(null)
  }

  return (
    <div>
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <div className="p-4 border-b border-slate-100">
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar producto..."
            className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-4xl mb-3">🍽</p>
            <p className="text-slate-500 text-sm">No hay platos activos aún. Importá una carta para empezar.</p>
          </div>
        ) : (
          Object.entries(grouped).map(([categoryName, categoryItems]) => (
            <div key={categoryName}>
              <div className="bg-slate-50 px-4 py-2 text-xs font-semibold text-slate-500 uppercase tracking-wide">{categoryName}</div>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-slate-50">
                  {categoryItems.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 w-1/3">
                        <p className="font-medium text-slate-800">{item.name}</p>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900 w-32">{formatCurrency(item.selling_price)}</td>
                      <td className="px-4 py-3">
                        {linkingId === item.id ? (
                          <select
                            autoFocus
                            defaultValue={item.recipes?.id || ''}
                            onChange={e => handleLinkRecipe(item.id, e.target.value)}
                            onBlur={() => setLinkingId(null)}
                            className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:border-indigo-500"
                          >
                            <option value="">Sin receta</option>
                            {recipes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        ) : (
                          <button onClick={() => setLinkingId(item.id)}>
                            {item.recipes ? (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700">Recipe Connected</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-orange-100 text-orange-700">Recipe Missing</span>
                            )}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => openEdit(item)} className="text-slate-400 hover:text-indigo-600 transition-colors text-sm">Editar</button>
                          <button onClick={() => handleArchive(item.id)} className="text-slate-400 hover:text-red-500 transition-colors text-sm">Archivar</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h3 className="font-bold text-slate-900 text-lg mb-5">Editar producto</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Nombre</label>
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Categoría</label>
                <select value={form.category_id} onChange={e => setForm(f => ({ ...f, category_id: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500">
                  <option value="">Sin categoría</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Precio de venta ($)</label>
                <input type="number" value={form.selling_price} onChange={e => setForm(f => ({ ...f, selling_price: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500" />
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
