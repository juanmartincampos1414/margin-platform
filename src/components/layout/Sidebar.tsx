'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { cn } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'

const nav = [
  { href: '/dashboard', label: 'Dashboard', icon: '▦' },
  { href: '/recetas', label: 'Recetas', icon: '🍽' },
  { href: '/ingredientes', label: 'Ingredientes', icon: '🥩' },
  { href: '/facturas', label: 'Facturas OCR', icon: '📄' },
  { href: '/analisis', label: 'Análisis', icon: '📊' },
]

interface Props {
  restaurantName: string
  userInitial: string
}

export default function Sidebar({ restaurantName, userInitial }: Props) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-60 bg-slate-950 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5 border-b border-slate-800">
        <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-sm text-white shrink-0">M</div>
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm truncate">{restaurantName}</p>
          <p className="text-slate-500 text-xs">Margin Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {nav.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
              pathname === item.href || pathname.startsWith(item.href + '/')
                ? 'bg-indigo-500/10 text-indigo-400'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            )}
          >
            <span className="text-base">{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      {/* User */}
      <div className="px-3 py-4 border-t border-slate-800">
        <div className="flex items-center gap-3 px-3 py-2.5">
          <div className="w-8 h-8 bg-slate-700 rounded-full flex items-center justify-center text-white text-sm font-semibold shrink-0">
            {userInitial}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-300 text-sm font-medium truncate">Mi cuenta</p>
          </div>
          <button onClick={handleLogout} className="text-slate-500 hover:text-slate-300 text-xs transition-colors" title="Cerrar sesión">
            ⇥
          </button>
        </div>
      </div>
    </aside>
  )
}
