import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import DashboardContent from '@/components/dashboard/DashboardContent'
import { calculateRecipeCost, calculateProfitability } from '@/lib/recipes'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, restaurant_id, restaurants(name)')
    .eq('id', user.id)
    .single()

  const restaurantId = profile?.restaurant_id
  const restaurantName = (profile?.restaurants as any)?.name || 'Mi Restaurante'
  const userInitial = (profile?.full_name || user.email || 'U')[0].toUpperCase()

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id')
    .eq('restaurant_id', restaurantId)
    .neq('status', 'archived')

  // Economic KPIs: blended margin only over costed menu items.
  // pctCosted provides the coverage context so the margin number is never misleading.
  const { data: menuItems } = await supabase
    .from('menu_items')
    .select('id, selling_price, recipe_id, recipes(recipe_ingredients(quantity, unit, ingredients(current_price, unit)))')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')

  const allActiveItems = menuItems || []
  const costedItems = allActiveItems
    .filter(item => (item.recipes as any)?.recipe_ingredients?.length > 0)
    .map(item => {
      const cost = calculateRecipeCost((item.recipes as any).recipe_ingredients)
      return calculateProfitability(item.selling_price, cost)
    })

  const totalMenuItems = allActiveItems.length
  const pctCosted = totalMenuItems > 0 ? (costedItems.length / totalMenuItems) * 100 : 0
  const avgMargin = costedItems.length > 0
    ? costedItems.reduce((s, p) => s + p.grossMarginPct, 0) / costedItems.length
    : 0

  // Count active menu items without a linked recipe — drives the "Platos sin receta" banner.
  const unlinkedMenuItemCount = allActiveItems.filter(i => !i.recipe_id).length

  const { count: invoicesToReview } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .in('status', ['review_required', 'failed'])

  const { count: pendingRecommendationsCount } = await supabase
    .from('ai_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('restaurant_id', restaurantId)
    .eq('status', 'pending')

  const { data: recommendations } = await supabase
    .from('ai_recommendations')
    .select('id, title, description, type, estimated_impact_pp, priority')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'pending')
    .order('priority', { ascending: true })
    .order('estimated_impact_pp', { ascending: false })
    .limit(5)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar restaurantName={restaurantName} userInitial={userInitial} />
      <main className="flex-1 overflow-auto">
        <DashboardContent
          restaurantName={restaurantName}
          ingredientCount={ingredients?.length || 0}
          recommendations={recommendations || []}
          avgMargin={avgMargin}
          pctCosted={pctCosted}
          invoicesToReview={invoicesToReview || 0}
          pendingRecommendationsCount={pendingRecommendationsCount || 0}
          unlinkedMenuItemCount={unlinkedMenuItemCount}
        />
      </main>
    </div>
  )
}
