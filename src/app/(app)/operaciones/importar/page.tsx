'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const sourceTypes = [
  { value: 'pos_report', label: 'Reporte POS', icon: '🖥', desc: 'Exportación de sistema de punto de venta' },
  { value: 'cash_register', label: 'Cierre de caja', icon: '💰', desc: 'Cierre diario o por turno' },
  { value: 'excel', label: 'Planilla Excel', icon: '📊', desc: 'XLSX con ventas del período' },
  { value: 'pdf', label: 'PDF', icon: '📄', desc: 'Reporte en formato PDF' },
  { value: 'image', label: 'Foto / captura', icon: '📸', desc: 'Screenshot del sistema o foto del cierre' },
]

export default function ImportarOperacionesPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [sourceType, setSourceType] = useState('image')
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function handleFile(f: File) {
    setFile(f)
    setError(null)
    // Auto-detect source type from extension
    const ext = f.name.split('.').pop()?.toLowerCase()
    if (ext === 'pdf') setSourceType('pdf')
    else if (['xlsx', 'xls'].includes(ext || '')) setSourceType('excel')
  }

  async function handleImport() {
    if (!file) return
    setStatus('uploading')
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('source_type', sourceType)

      const uploadRes = await fetch('/api/operations/import/upload', { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error)

      setStatus('processing')
      const processRes = await fetch('/api/operations/import/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId: uploadData.id }),
      })
      const processData = await processRes.json()
      if (!processRes.ok) throw new Error(processData.error)

      router.push(`/operaciones/importar/${uploadData.id}`)
    } catch (e: any) {
      setError(e.message || 'Error al procesar el archivo')
      setStatus('error')
    }
  }

  const isDone = status === 'uploading' || status === 'processing'

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/operaciones" className="hover:text-slate-600">Operaciones</Link>
        <span>›</span>
        <span className="text-slate-600">Importar ventas</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Importar datos operativos</h1>
        <p className="text-slate-500 mt-1">Subí tu cierre de caja, reporte POS o planilla de ventas — Margin extrae ventas, cubiertos, ticket promedio y mix de productos.</p>
      </div>

      {/* Source type selector */}
      <div className="mb-6">
        <p className="text-sm font-medium text-slate-700 mb-3">Tipo de documento</p>
        <div className="grid grid-cols-5 gap-2">
          {sourceTypes.map(s => (
            <button
              key={s.value}
              onClick={() => setSourceType(s.value)}
              className={`p-3 rounded-xl border text-center transition-colors ${
                sourceType === s.value
                  ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                  : 'border-slate-200 hover:border-slate-300 text-slate-600'
              }`}
            >
              <span className="text-xl">{s.icon}</span>
              <p className="text-xs font-medium mt-1 leading-tight">{s.label}</p>
            </button>
          ))}
        </div>
        <p className="text-slate-400 text-xs mt-1.5">{sourceTypes.find(s => s.value === sourceType)?.desc}</p>
      </div>

      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-2xl p-10 text-center transition-colors cursor-pointer mb-6 ${
          dragging ? 'border-indigo-400 bg-indigo-50' : file ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'
        }`}
        onClick={() => fileRef.current?.click()}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => {
          e.preventDefault()
          setDragging(false)
          const f = e.dataTransfer.files[0]
          if (f) handleFile(f)
        }}
      >
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          accept=".pdf,.xlsx,.xls,.csv,.png,.jpg,.jpeg,.webp"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        {file ? (
          <>
            <p className="text-4xl mb-2">✅</p>
            <p className="font-semibold text-slate-900">{file.name}</p>
            <p className="text-slate-400 text-sm mt-1">{(file.size / 1024).toFixed(0)} KB</p>
            <button onClick={e => { e.stopPropagation(); setFile(null) }} className="text-slate-400 hover:text-slate-600 text-xs mt-2">Cambiar archivo</button>
          </>
        ) : (
          <>
            <p className="text-4xl mb-3">📁</p>
            <p className="font-semibold text-slate-700">Arrastrá el archivo aquí</p>
            <p className="text-slate-400 text-sm mt-1">o hacé click para seleccionarlo</p>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm mb-4">{error}</div>
      )}

      {isDone && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-4 py-3 text-sm mb-4 flex items-center gap-3">
          <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin shrink-0" />
          <p className="text-indigo-700">
            {status === 'uploading' ? 'Subiendo archivo...' : 'Claude está extrayendo los datos operativos...'}
          </p>
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={!file || isDone}
        className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors"
      >
        {isDone ? 'Procesando...' : 'Extraer datos con IA'}
      </button>

      <p className="text-slate-400 text-xs text-center mt-3">
        Los datos extraídos se muestran para revisión antes de confirmarse. Nada se guarda como definitivo sin tu aprobación.
      </p>
    </div>
  )
}
