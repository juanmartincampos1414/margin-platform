'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ImportarRecetasPage() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'error'>('idle')
  const [progress, setProgress] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)

  function handleFile(f: File) {
    setFile(f)
    setError(null)
  }

  async function handleImport() {
    if (!file) return
    setStatus('uploading')
    setError(null)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const uploadRes = await fetch('/api/recipes/import/upload', { method: 'POST', body: formData })
      const uploadData = await uploadRes.json()
      if (!uploadRes.ok) throw new Error(uploadData.error)

      setStatus('processing')
      setProgress('Iniciando extracción...')

      // Loop por chunks — cada llamada procesa CHUNK_SIZE páginas.
      // Esto mantiene cada request dentro del límite de timeout de Vercel.
      let startPage = 0
      let done = false
      while (!done) {
        const processRes = await fetch('/api/recipes/import/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ importId: uploadData.id, startPage }),
        })

        // Vercel puede devolver texto plano en caso de timeout — verificar Content-Type primero.
        const contentType = processRes.headers.get('content-type') || ''
        if (!contentType.includes('application/json')) {
          const text = await processRes.text()
          if (processRes.status >= 500 || text.toLowerCase().includes('timeout') || text.toLowerCase().includes('ended')) {
            throw new Error('El servidor tardó demasiado. Intentá de nuevo — el progreso ya guardado se mantiene.')
          }
          throw new Error(`Error inesperado del servidor (${processRes.status}). Intentá de nuevo.`)
        }

        const processData = await processRes.json()
        if (!processRes.ok) throw new Error(processData.error || 'Error al procesar')

        done = processData.done
        if (!done && processData.nextPage != null) {
          startPage = processData.nextPage
          setProgress(
            `Procesando páginas ${processData.processedPages} de ${processData.totalPages}... (${processData.recipesFoundInChunk} recetas detectadas en este bloque)`
          )
        }
      }

      router.push(`/recetas/importar/${uploadData.id}`)
    } catch (e: any) {
      setError(e.message || 'Error al procesar el archivo')
      setStatus('error')
    }
  }

  const isDone = status === 'uploading' || status === 'processing'

  return (
    <div className="p-8 max-w-2xl">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/recetas" className="hover:text-slate-600">Recetas</Link>
        <span>›</span>
        <span className="text-slate-600">Importar recetas</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Importar recetas</h1>
        <p className="text-slate-500 mt-1">Subí cualquier archivo con tus recetas — Margin extrae los ingredientes, cantidades y precios automáticamente.</p>
      </div>

      {/* Format guide */}
      <div className="grid grid-cols-4 gap-3 mb-8">
        {[
          { icon: '📸', label: 'Foto / captura', desc: 'PNG, JPG, WEBP' },
          { icon: '📄', label: 'PDF', desc: 'Documento PDF' },
          { icon: '📊', label: 'Excel', desc: 'XLSX, XLS' },
          { icon: '📋', label: 'CSV', desc: 'Archivo CSV' },
        ].map(f => (
          <div key={f.label} className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
            <span className="text-2xl">{f.icon}</span>
            <p className="text-slate-700 text-xs font-medium mt-1">{f.label}</p>
            <p className="text-slate-400 text-xs">{f.desc}</p>
          </div>
        ))}
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
            {status === 'uploading'
              ? 'Subiendo archivo...'
              : progress || 'Iniciando extracción con IA...'}
          </p>
        </div>
      )}

      <button
        onClick={handleImport}
        disabled={!file || isDone}
        className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white py-3 rounded-xl font-medium transition-colors"
      >
        {isDone ? 'Procesando...' : 'Extraer recetas con IA'}
      </button>

      <p className="text-slate-400 text-xs text-center mt-3">
        Margin mostrará todas las recetas detectadas para que las revises antes de confirmar. Nada se guarda sin tu aprobación.
      </p>
    </div>
  )
}
