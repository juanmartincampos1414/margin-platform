import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function MenuSaludPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: activeItems } = await supabase
    .from('menu_items')
    .select('id, recipe_id')
    .eq('restaurant_id', profile?.restaurant_id)
    .eq('status', 'active')

  const total = activeItems?.length || 0
  const withRecipe = activeItems?.filter(i => i.recipe_id).length || 0
  const withoutRecipe = total - withRecipe
  const pctCosted = total > 0 ? (withRecipe / total) * 100 : 0

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/menu" className="hover:text-slate-600">Menu Intelligence</Link>
        <span>›</span>
        <span className="text-slate-600">Salud del menú</span>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Salud del menú</h1>
        <p className="text-slate-500 mt-1">Estado general de tu carta activa</p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-slate-400 text-xs mb-1">Productos Totales</p>
          <p className="text-2xl font-bold text-slate-900">{total}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-slate-400 text-xs mb-1">Productos con Receta</p>
          <p className="text-2xl font-bold text-emerald-600">{withRecipe}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <p className="text-slate-400 text-xs mb-1">Productos sin Receta</p>
          <p className="text-2xl font-bold text-orange-500">{withoutRecipe}</p>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-3">
          <p className="font-semibold text-slate-900">Carta costeada</p>
          <p className="font-bold text-slate-900">{pctCosted.toFixed(0)}%</p>
        </div>
        <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-emerald-500 transition-all"
            style={{ width: `${pctCosted}%` }}
          />
        </div>
        <p className="text-slate-400 text-xs mt-3">
          {withoutRecipe > 0
            ? `${withoutRecipe} producto${withoutRecipe > 1 ? 's' : ''} aún sin receta vinculada — vinculalos desde Menu Intelligence para poder calcular su food cost.`
            : 'Todos los productos activos tienen una receta vinculada.'}
        </p>
      </div>
    </div>
  )
}
