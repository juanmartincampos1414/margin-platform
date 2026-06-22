'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

export default function InvoiceActions({ invoiceId }: { invoiceId: string }) {
  const router = useRouter()
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!confirm('¿Eliminar esta factura? Quedará marcada como eliminada y no aparecerá en los listados.')) return
    setDeleting(true)
    const res = await fetch(`/api/invoices/${invoiceId}`, { method: 'DELETE' })
    if (res.ok) {
      router.push('/facturas')
      router.refresh()
    } else {
      const data = await res.json()
      alert(data.error || 'Error al eliminar')
      setDeleting(false)
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={deleting}
      className="ml-auto text-sm text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
    >
      {deleting ? 'Eliminando...' : '🗑 Eliminar factura'}
    </button>
  )
}
