import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import Sidebar from '@/components/layout/Sidebar'
import DashboardContent from '@/components/dashboard/DashboardContent'

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

  // KPIs
  const { data: recipes } = await supabase
    .from('recipes')
    .select('id, name, sale_price, status')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'active')

  const { data: ingredients } = await supabase
    .from('ingredients')
    .select('id')
    .eq('restaurant_id', restaurantId)

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, status')
    .eq('restaurant_id', restaurantId)
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: recommendations } = await supabase
    .from('ai_recommendations')
    .select('id, title, type, estimated_impact_pp, priority')
    .eq('restaurant_id', restaurantId)
    .eq('status', 'pending')
    .order('estimated_impact_pp', { ascending: false })
    .limit(3)

  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar restaurantName={restaurantName} userInitial={userInitial} />
      <main className="flex-1 overflow-auto">
        <DashboardContent
          restaurantName={restaurantName}
          recipes={recipes || []}
          ingredientCount={ingredients?.length || 0}
          recentInvoices={invoices || []}
          recommendations={recommendations || []}
        />
      </main>
    </div>
  )
}
