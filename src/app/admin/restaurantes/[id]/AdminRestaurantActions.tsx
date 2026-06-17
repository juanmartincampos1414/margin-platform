'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

const PLANS = ['trial', 'basic', 'pro', 'enterprise']

export default function AdminRestaurantActions({ restaurant }: { restaurant: any }) {
  const router = useRouter()
  const [plan, setPlan] = useState(restaurant.plan)
  const [active, setActive] = useState(restaurant.active)
  const [saving, setSaving] = useState(false)

  async function handleSave() {
    setSaving(true)
    await fetch(`/api/admin/restaurants/${restaurant.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan, active }),
    })
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
      <h2 className="font-semibold mb-4">Gestión</h2>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">Plan</label>
          <select value={plan} onChange={e => setPlan(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500">
            {PLANS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1.5">Estado</label>
          <select value={String(active)} onChange={e => setActive(e.target.value === 'true')} className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white text-sm focus:outline-none focus:border-indigo-500">
            <option value="true">Activo</option>
            <option value="false">Inactivo</option>
          </select>
        </div>
      </div>
      <button onClick={handleSave} disabled={saving} className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-xl text-sm font-medium transition-colors">
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  )
}
