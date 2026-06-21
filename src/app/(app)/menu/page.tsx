import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import MenuLibraryClient from './MenuLibraryClient'

export default async function MenuPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const restaurantId = profile?.restaurant_id

  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('*, menu_categories(id, name), recipes(id, name)')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')
    .order('name')

  const { count: pendingCount } = await supabase
    .from('menu_items')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'pending_review')

  const { data: categories } = await supabase
    .from('menu_categories')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .order('name')

  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, name')
    .eq('restaurant_id', restaurantId)
    .order('name')

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Menu Intelligence</h1>
          <p className="text-slate-500 mt-1">{menuItems?.length || 0} platos activos en carta</p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/menu/salud" className="border border-slate-200 text-slate-700 hover:bg-slate-50 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            Salud del menú
          </Link>
          <Link href="/menu/importar" className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
            + Importar carta
          </Link>
        </div>
      </div>

      {!!pendingCount && pendingCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-4 py-3 text-sm mb-6">
          Tenés {pendingCount} producto{pendingCount > 1 ? 's' : ''} pendiente{pendingCount > 1 ? 's' : ''} de revisión de una carta importada.
        </div>
      )}

      <MenuLibraryClient
        menuItems={menuItems || []}
        categories={categories || []}
        recipes={recipes || []}
      />
    </div>
  )
}
