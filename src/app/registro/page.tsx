'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegistroPage() {
  const router = useRouter()
  const [form, setForm] = useState({ restaurantName: '', email: '', password: '', fullName: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    const supabase = createClient()

    // 1. Create auth user
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: { data: { full_name: form.fullName } },
    })

    if (signUpError || !data.user) {
      setError(signUpError?.message || 'Error al crear la cuenta')
      setLoading(false)
      return
    }

    // 2. Create restaurant + link profile via API
    const res = await fetch('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ restaurantName: form.restaurantName, userId: data.user.id, email: form.email }),
    })

    if (!res.ok) {
      setError('Error al configurar el restaurante')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  const update = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [key]: e.target.value }))

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center font-bold text-xl mx-auto mb-4">M</div>
          <h1 className="text-2xl font-bold text-white">Crear tu cuenta</h1>
          <p className="text-slate-400 mt-1 text-sm">14 días gratis, sin tarjeta</p>
        </div>

        <form onSubmit={handleRegister} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 space-y-4">
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg px-4 py-3 text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Nombre del restaurante</label>
            <input value={form.restaurantName} onChange={update('restaurantName')} required placeholder="El Buen Sabor" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Tu nombre</label>
            <input value={form.fullName} onChange={update('fullName')} required placeholder="Juan García" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Email</label>
            <input type="email" value={form.email} onChange={update('email')} required placeholder="tu@restaurante.com" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1.5">Contraseña</label>
            <input type="password" value={form.password} onChange={update('password')} required minLength={8} placeholder="Mínimo 8 caracteres" className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500 transition-colors" />
          </div>
          <button type="submit" disabled={loading} className="w-full bg-indigo-500 hover:bg-indigo-600 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium text-sm transition-colors">
            {loading ? 'Creando cuenta...' : 'Crear cuenta gratis →'}
          </button>
        </form>

        <p className="text-center text-slate-400 text-sm mt-6">
          ¿Ya tenés cuenta?{' '}
          <Link href="/login" className="text-indigo-400 hover:text-indigo-300">Iniciá sesión</Link>
        </p>
      </div>
    </div>
  )
}
