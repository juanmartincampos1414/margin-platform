'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface ContactData {
  phone: string
  email: string
  whatsapp: string
  instagram: string
  website: string
  contact_name: string
  payment_terms: string
  credit_days: number | null
  notes: string
}

interface Props {
  supplierId: string
  initialData: ContactData
}

export default function SupplierContactEditor({ supplierId, initialData }: Props) {
  const router = useRouter()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState(initialData)

  const hasAnyContact = Object.values(initialData).some(v => v !== '' && v !== null)

  async function handleSave() {
    setSaving(true)
    const res = await fetch(`/api/suppliers/${supplierId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    if (res.ok) {
      setEditing(false)
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error || 'Error al guardar')
    }
    setSaving(false)
  }

  if (!editing) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900">Datos de contacto</h2>
          <button onClick={() => setEditing(true)} className="text-indigo-600 hover:text-indigo-700 text-sm font-medium">
            Editar
          </button>
        </div>
        {!hasAnyContact ? (
          <p className="text-slate-400 text-sm">No hay datos de contacto cargados aún.{' '}
            <button onClick={() => setEditing(true)} className="text-indigo-600 hover:underline">Agregar</button>
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm">
            {[
              { label: 'Contacto', value: initialData.contact_name },
              { label: 'Teléfono', value: initialData.phone },
              { label: 'Email', value: initialData.email },
              { label: 'WhatsApp', value: initialData.whatsapp },
              { label: 'Instagram', value: initialData.instagram ? `@${initialData.instagram.replace(/^@/, '')}` : null },
              { label: 'Sitio web', value: initialData.website },
              { label: 'Condición de pago', value: initialData.payment_terms },
              { label: 'Días de crédito', value: initialData.credit_days != null ? `${initialData.credit_days} días` : null },
            ].map(f => f.value ? (
              <div key={f.label}>
                <p className="text-slate-400 text-xs mb-0.5">{f.label}</p>
                <p className="font-medium text-slate-800">{f.value}</p>
              </div>
            ) : null)}
            {initialData.notes && (
              <div className="col-span-2">
                <p className="text-slate-400 text-xs mb-0.5">Notas</p>
                <p className="text-slate-700">{initialData.notes}</p>
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="bg-white border border-indigo-200 rounded-2xl p-6 mb-6">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-semibold text-slate-900">Datos de contacto</h2>
        <button onClick={() => { setEditing(false); setForm(initialData) }} className="text-slate-400 hover:text-slate-600 text-sm">
          Cancelar
        </button>
      </div>
      <div className="grid grid-cols-2 gap-4">
        {[
          { key: 'contact_name', label: 'Contacto comercial', placeholder: 'Nombre del vendedor' },
          { key: 'phone', label: 'Teléfono', placeholder: '+54 11 1234-5678' },
          { key: 'email', label: 'Email', placeholder: 'ventas@proveedor.com' },
          { key: 'whatsapp', label: 'WhatsApp', placeholder: '+54 11 1234-5678' },
          { key: 'instagram', label: 'Instagram', placeholder: '@proveedor' },
          { key: 'website', label: 'Sitio web', placeholder: 'www.proveedor.com' },
          { key: 'payment_terms', label: 'Condición de pago', placeholder: 'Ej: 30 días factura' },
        ].map(({ key, label, placeholder }) => (
          <div key={key}>
            <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
            <input
              value={(form as any)[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              placeholder={placeholder}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        ))}
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Días de crédito</label>
          <input
            type="number"
            value={form.credit_days ?? ''}
            onChange={e => setForm(f => ({ ...f, credit_days: e.target.value ? Number(e.target.value) : null }))}
            placeholder="0"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
          <textarea
            value={form.notes}
            onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            placeholder="Condiciones especiales, horarios de entrega, observaciones..."
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 resize-none"
          />
        </div>
      </div>
      <div className="flex justify-end mt-4">
        <button onClick={handleSave} disabled={saving} className="bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors">
          {saving ? 'Guardando...' : 'Guardar contacto'}
        </button>
      </div>
    </div>
  )
}
