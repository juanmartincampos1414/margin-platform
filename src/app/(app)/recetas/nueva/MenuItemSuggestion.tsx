'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Item {
  id: string
  name: string
  selling_price: number
  category: string | null
}

export default function MenuItemSuggestion({ items }: { items: Item[] }) {
  const router = useRouter()
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) return null

  function handleSelect(item: Item) {
    router.push(`/recetas/nueva?menu_item_id=${item.id}`)
  }

  return (
    <div className="mb-8 bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold text-slate-900 text-sm">
            🍽 {items.length} {items.length === 1 ? 'plato del menú sin receta' : 'platos del menú sin receta'}
          </p>
          <p className="text-slate-500 text-xs mt-0.5">¿Estás creando la receta de uno de estos platos? Seleccionalo para pre-llenar el nombre y precio.</p>
        </div>
        <button onClick={() => setDismissed(true)} className="text-slate-300 hover:text-slate-500 text-lg leading-none ml-4">×</button>
      </div>
      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto">
        {items.map(item => (
          <button
            key={item.id}
            onClick={() => handleSelect(item)}
            className="flex items-center justify-between p-2.5 rounded-xl bg-white border border-indigo-100 hover:border-indigo-400 hover:shadow-sm transition-all text-left"
          >
            <div className="min-w-0">
              <p className="text-slate-800 text-sm font-medium truncate">{item.name}</p>
              {item.category && <p className="text-slate-400 text-xs">{item.category}</p>}
            </div>
            <span className="text-slate-500 text-xs shrink-0 ml-2">${item.selling_price.toLocaleString('es-AR')}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
