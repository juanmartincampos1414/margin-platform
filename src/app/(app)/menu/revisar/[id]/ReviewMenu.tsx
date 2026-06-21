'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { formatCurrency } from '@/lib/utils'

interface Category { id: string; name: string }
interface MenuItem {
  id: string
  name: string
  selling_price: number
  status: string
  menu_categories?: Category | null
}

interface Props {
  importId: string
  items: MenuItem[]
  categories: Category[]
}

function normalize(name: string) {
  return name.trim().toUpperCase().replace(/\s+/g, ' ')
}

function isDuplicatePair(a: string, b: string) {
  if (a === b) return true
  return a.startsWith(b) || b.startsWith(a)
}

export default function ReviewMenu({ importId, items: initial, categories }: Props) {
  const router = useRouter()
  const [items, setItems] = useState(initial)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', category_id: '', selling_price: '' })
  const [confirming, setConfirming] = useState(false)

  // FR-033 Duplicate Detection within this batch — simple normalized-name
  // exact/prefix match, surfaced inline so the user can merge before
  // confirming.
  const duplicateIds: Record<string, string[]> = {}
  for (const item of items) {
    for (const other of items) {
      if (item.id === other.id) continue
      if (isDuplicatePair(normalize(item.name), normalize(other.name))) {
        duplicateIds[item.id] = duplicateIds[item.id] || []
        duplicateIds[item.id].push(other.id)
      }
    }
  }

  function openEdit(item: MenuItem) {
    setForm({ name: item.name, category_id: item.menu_categories?.id || '', selling_price: String(item.selling_price) })
    setEditingId(item.id)
  }

  async function handleSaveEdit() {
    if (!editingId) return
    const res = await fetch(`/api/menu/item/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name,
        category_id: form.category_id || null,
        selling_price: parseFloat(form.selling_price) || 0,
      }),
    })
    const data = await res.json()
    if (res.ok) setItems(prev => prev.map(i => i.id === editingId ? data : i))
    setEditingId(null)
  }

  async function handleDelete(id: string) {
    const res = await fetch(`/api/menu/item/${id}`, { method: 'DELETE' })
    if (res.ok) setItems(prev => prev.filter(i => i.id !== id))
  }

  async function handleMerge(keepId: string, dropId: string) {
    if (!confirm('¿Fusionar productos? El duplicado se va a archivar.')) return
    const res = await fetch(`/api/menu/item/${dropId}`, { method: 'DELETE' })
    if (res.ok) setItems(prev => prev.filter(i => i.id !== dropId))
  }

  async function handleConfirm() {
    setConfirming(true)
    const res = await fetch('/api/menu/confirm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemIds: items.map(i => i.id) }),
    })
    if (res.ok) {
      router.push('/menu')
      router.refresh()
    } else {
      setConfirming(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Categoría</th>
              <th className="text-left px-4 py-3 text-slate-500 font-medium">Producto</th>
              <th className="text-right px-4 py-3 text-slate-500 font-medium">Precio</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-slate-50">
                <td className="px-4 py-3 text-slate-600">{item.menu_categories?.name || '—'}</td>
                <td className="px-4 py-3">
                  <p className="font-medium text-slate-800">{item.name}</p>
                  {duplicateIds[item.id]?.length > 0 && (
                    <p className="text-orange-500 text-xs">⚠ Posible duplicado</p>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(item.selling_price)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {duplicateIds[item.id]?.length > 0 && (
                      <button onClick={() => handleMerge(item.id, duplicateIds[item.id][0])} className="text-orange-500 hover:text-orange-600 text-sm">Fusionar</button>
                    )}
                    <button onClick={() => openEdit(item)} className="text-slate-400 hover:text-indigo-600 text-sm">Editar</button>
                    <button onClick={() => handleDelete(item.id)} className="text-slate-400 hover:text-red-500 text-sm">Eliminar</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <button onClick={handleConfirm} disabled={confirming || items.length === 0} className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors">
        {confirming ? 'Confirmando...' : 'Confirmar carta ✓'}
      </button>

      {editingId && (
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
              <button onClick={() => setEditingId(null)} className="flex-1 border border-slate-200 text-slate-600 py-2.5 rounded-xl text-sm font-medium hover:bg-slate-50">Cancelar</button>
              <button onClick={handleSaveEdit} className="flex-1 bg-indigo-500 hover:bg-indigo-600 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
