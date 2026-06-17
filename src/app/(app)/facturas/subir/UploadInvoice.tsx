'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  restaurantId?: string
}

export default function UploadInvoice({ restaurantId }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  function handleFile(f: File) {
    setFile(f)
    setResult(null)
    setError('')
    if (f.type.startsWith('image/')) {
      const reader = new FileReader()
      reader.onload = e => setPreview(e.target?.result as string)
      reader.readAsDataURL(f)
    } else {
      setPreview(null)
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  async function handleProcess() {
    if (!file || !restaurantId) return
    setLoading(true)
    setError('')

    const formData = new FormData()
    formData.append('file', file)
    formData.append('restaurantId', restaurantId)

    try {
      const res = await fetch('/api/ocr', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Error al procesar la factura')
      const data = await res.json()
      setResult(data)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!result?.invoiceId) return
    router.push(`/facturas/${result.invoiceId}`)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'}`}
      >
        <input ref={fileRef} type="file" accept="image/*,.pdf" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {preview ? (
          <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-xl" />
        ) : (
          <>
            <p className="text-4xl mb-4">{file ? '📄' : '📤'}</p>
            <p className="text-slate-600 font-medium">{file ? file.name : 'Arrastrá o hacé click para subir'}</p>
            <p className="text-slate-400 text-sm mt-1">Soporta imágenes (JPG, PNG) y PDF</p>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {file && !result && (
        <button onClick={handleProcess} disabled={loading} className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors">
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
              Procesando con IA...
            </span>
          ) : 'Procesar factura con IA'}
        </button>
      )}

      {/* Results */}
      {result && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-slate-900">Datos extraídos</h3>
            <div className="flex items-center gap-2">
              <span className="text-slate-400 text-sm">Confianza:</span>
              <span className={`font-bold text-sm ${result.confidence >= 80 ? 'text-emerald-600' : 'text-yellow-600'}`}>{result.confidence}%</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              { label: 'Proveedor', value: result.supplier_name },
              { label: 'CUIT', value: result.supplier_cuit },
              { label: 'N° Factura', value: result.invoice_number },
              { label: 'Fecha', value: result.invoice_date },
              { label: 'Total', value: result.total_amount ? `$${Number(result.total_amount).toLocaleString('es-AR')}` : null },
            ].map(field => (
              <div key={field.label}>
                <p className="text-slate-400 text-xs mb-0.5">{field.label}</p>
                <p className="font-medium text-slate-800">{field.value || '—'}</p>
              </div>
            ))}
          </div>

          {result.items?.length > 0 && (
            <div>
              <h4 className="font-medium text-slate-700 text-sm mb-2">Productos detectados</h4>
              <div className="space-y-1.5">
                {result.items.map((item: any, i: number) => (
                  <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2">
                    <div>
                      <p className="text-slate-800 text-sm">{item.product_name}</p>
                      {item.quantity && <p className="text-slate-400 text-xs">{item.quantity} {item.unit}</p>}
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-slate-800 text-sm">${Number(item.unit_price || 0).toLocaleString('es-AR')}/{item.unit}</p>
                      {item.price_change_pct && Math.abs(item.price_change_pct) > 0 && (
                        <p className={`text-xs font-medium ${item.price_change_pct > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                          {item.price_change_pct > 0 ? '▲' : '▼'} {Math.abs(item.price_change_pct).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <button onClick={handleSave} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 rounded-xl font-medium text-sm transition-colors">
            Guardar factura ✓
          </button>
        </div>
      )}
    </div>
  )
}
