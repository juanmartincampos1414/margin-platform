import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ImportMenu from './ImportMenu'

export default async function ImportarMenuPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Importar carta</h1>
        <p className="text-slate-500 mt-1">La IA detecta categorías, productos y precios. Nunca crea recetas ni calcula costos — eso se hace después, manualmente.</p>
      </div>
      <ImportMenu />
    </div>
  )
}
