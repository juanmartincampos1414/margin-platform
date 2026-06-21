import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import RecipeForm from '@/components/recipes/RecipeForm'

export default async function NuevaRecetaPage({ searchParams }: { searchParams: Promise<{ menu_item_id?: string }> }) {
  const { menu_item_id: menuItemId } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id, name, unit, current_price, brand')
    .eq('restaurant_id', profile?.restaurant_id)
    .neq('status', 'archived')
    .order('name')

  let menuItem = null
  if (menuItemId) {
    const { data } = await supabase
      .from('menu_items')
      .select('id, name, selling_price')
      .eq('id', menuItemId)
      .eq('restaurant_id', profile?.restaurant_id)
      .single()
    menuItem = data
  }

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        {menuItem && (
          <div className="flex items-center gap-2 text-slate-400 text-sm mb-2">
            <Link href="/menu" className="hover:text-slate-600">Menu Intelligence</Link>
            <span>›</span>
            <span className="text-slate-600">Crear receta</span>
          </div>
        )}
        <h1 className="text-2xl font-bold text-slate-900">Nueva receta</h1>
        <p className="text-slate-500 mt-1">
          {menuItem
            ? `Creando la receta de "${menuItem.name}" — el precio de venta es de referencia inicial, no queda sincronizado con el precio del menú.`
            : 'Creá un plato y calculá su costo y margen en tiempo real.'}
        </p>
      </div>
      <RecipeForm
        ingredients={ingredients || []}
        restaurantId={profile?.restaurant_id}
        initialName={menuItem?.name}
        initialSalePrice={menuItem?.selling_price}
        menuItemId={menuItem?.id}
      />
    </div>
  )
}
