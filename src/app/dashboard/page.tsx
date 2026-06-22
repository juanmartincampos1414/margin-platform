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

  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
  const since = sevenDaysAgo.toISOString().slice(0, 10)

  // Parallel fetches — all data needed for the 3 dashboard sections
  const [
    { data: menuItems },
    { data: recentOps },
    { data: highRiskSuppliers },
    { count: invoicesToReview },
    { data: recommendations },
    { data: recentPriceChanges },
  ] = await Promise.all([
    // Economic KPIs: margin + pctCosted + food cost
    supabase
      .from('menu_items')
      .select('id, selling_price, recipe_id, recipes(recipe_ingredients(quantity, unit, ingredients(current_price, unit)))')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active'),

    // Operations: last 7 days
    supabase
      .from('daily_operations')
      .select('total_revenue, transactions, total_covers, avg_ticket')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'confirmed')
      .gte('operation_date', since),

    // Supplier alerts
    supabase
      .from('supplier_metrics')
      .select('suppliers(id, name)')
      .eq('restaurant_id', restaurantId)
      .eq('risk_level', 'high')
      .limit(3),

    // Invoice alerts
    supabase
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .in('status', ['review_required', 'failed']),

    // AI recommendations
    supabase
      .from('ai_recommendations')
      .select('id, title, description, type, estimated_impact_pp, priority')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'pending')
      .order('priority', { ascending: true })
      .order('estimated_impact_pp', { ascending: false })
      .limit(6),

    // Price change alerts: ingredients where price changed >15% in last 7 days
    supabase
      .from('price_history')
      .select('ingredient_id, old_price, new_price, recorded_at, ingredients(name)')
      .eq('restaurant_id', restaurantId)
      .gte('recorded_at', sevenDaysAgo.toISOString())
      .order('recorded_at', { ascending: false }),
  ])

  // Economic KPIs
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
  const avgFoodCost = costedItems.length > 0
    ? costedItems.reduce((s, p) => s + p.foodCostPct, 0) / costedItems.length
    : 0
  const unlinkedMenuItemCount = allActiveItems.filter(i => !i.recipe_id).length

  // Operations KPIs
  const ops = recentOps || []
  const opsRevenue = ops.reduce((s, op) => s + (Number(op.total_revenue) || 0), 0)
  const opsCovers = ops.reduce((s, op) => s + (Number(op.total_covers) || 0), 0)
  const opsTransactions = ops.reduce((s, op) => s + (Number(op.transactions) || 0), 0)
  const opsAvgTicket = opsTransactions > 0 ? opsRevenue / opsTransactions : null

  // Price change alerts — dedupe by ingredient, keep most recent, filter >15% change
  const seenIngredients = new Set<string>()
  const significantPriceChanges = (recentPriceChanges || [])
    .filter(ph => {
      if (!ph.ingredient_id || seenIngredients.has(ph.ingredient_id)) return false
      if (!ph.old_price || ph.old_price === 0) return false
      const pct = Math.abs((ph.new_price - ph.old_price) / ph.old_price) * 100
      if (pct < 15) return false
      seenIngredients.add(ph.ingredient_id)
      return true
    })
    .slice(0, 4)
    .map(ph => ({
      name: (ph.ingredients as any)?.name || 'Ingrediente',
      oldPrice: ph.old_price,
      newPrice: ph.new_price,
      pct: Math.round(((ph.new_price - ph.old_price) / ph.old_price) * 100),
      ingredientId: ph.ingredient_id,
    }))

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar restaurantName={restaurantName} userInitial={userInitial} />
      <main className="flex-1 overflow-auto">
        <DashboardContent
          restaurantName={restaurantName}
          // Qué pasó
          avgMargin={avgMargin}
          avgFoodCost={avgFoodCost}
          pctCosted={pctCosted}
          costedCount={costedItems.length}
          totalMenuItems={totalMenuItems}
          opsRevenue={opsRevenue}
          opsCovers={opsCovers}
          opsAvgTicket={opsAvgTicket}
          hasOpsData={ops.length > 0}
          // Qué requiere atención
          invoicesToReview={invoicesToReview || 0}
          highRiskSuppliers={(highRiskSuppliers || []).map(s => ({ name: (s.suppliers as any)?.name, id: (s.suppliers as any)?.id }))}
          unlinkedMenuItemCount={unlinkedMenuItemCount}
          significantPriceChanges={significantPriceChanges}
          // Qué debería hacer
          recommendations={recommendations || []}
        />
      </main>
    </div>
  )
}
