'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

export default function ImportMenu() {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  function handleFile(f: File) {
    setFile(f)
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

  async function handleUpload() {
    if (!file) return
    setProcessing(true)
    setError('')

    try {
      const formData = new FormData()
      formData.append('file', file)

      const importRes = await fetch('/api/menu/import', { method: 'POST', body: formData })
      if (!importRes.ok) throw new Error((await importRes.json()).error || 'Error al subir la carta')
      const menuImport = await importRes.json()

      const parseRes = await fetch('/api/menu/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId: menuImport.id }),
      })
      if (!parseRes.ok) throw new Error((await parseRes.json()).error || 'Error al analizar la carta')

      router.push(`/menu/revisar/${menuImport.id}`)
    } catch (e: any) {
      setError(e.message)
      setProcessing(false)
    }
  }

  if (processing) {
    return (
      <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
        <span className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-500 rounded-full animate-spin inline-block mb-5"></span>
        <h3 className="font-semibold text-slate-900 mb-2">Analizando carta...</h3>
        <p className="text-slate-500 text-sm">Detectando categorías, productos y precios</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-2xl p-12 text-center cursor-pointer transition-colors ${dragging ? 'border-indigo-400 bg-indigo-50' : 'border-slate-300 hover:border-indigo-300 hover:bg-slate-50'}`}
      >
        <input ref={fileRef} type="file" accept="image/*,.pdf,.csv,.xlsx" className="hidden" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} />
        {preview ? (
          <img src={preview} alt="Preview" className="max-h-64 mx-auto rounded-xl" />
        ) : (
          <>
            <p className="text-4xl mb-4">{file ? '📋' : '📤'}</p>
            <p className="text-slate-600 font-medium">{file ? file.name : 'Arrastrá o hacé click para subir'}</p>
            <p className="text-slate-400 text-sm mt-1">Soporta PDF, JPG, PNG, XLSX y CSV</p>
          </>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>
      )}

      {file && (
        <button onClick={handleUpload} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white py-3 rounded-xl font-medium transition-colors">
          Subir carta
        </button>
      )}
    </div>
  )
}
