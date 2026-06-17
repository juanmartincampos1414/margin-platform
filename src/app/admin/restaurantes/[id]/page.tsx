import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'
import AdminRestaurantActions from './AdminRestaurantActions'

export default async function AdminRestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: myProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single()
  if (myProfile?.role !== 'admin') redirect('/dashboard')

  const admin = await createAdminClient()
  const { data: restaurant } = await admin.from('restaurants').select('*').eq('id', id).single()
  if (!restaurant) notFound()

  const { data: profiles } = await admin.from('profiles').select('id, full_name, role').eq('restaurant_id', id)
  const { count: recipeCount } = await admin.from('recipes').select('*', { count: 'exact', head: true }).eq('restaurant_id', id)
  const { count: ingredientCount } = await admin.from('ingredients').select('*', { count: 'exact', head: true }).eq('restaurant_id', id)
  const { count: invoiceCount } = await admin.from('invoices').select('*', { count: 'exact', head: true }).eq('restaurant_id', id)

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8">
      <div className="max-w-3xl">
        <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
          <Link href="/admin" className="hover:text-white">Admin</Link>
          <span>›</span>
          <span className="text-white">{restaurant.name}</span>
        </div>

        <h1 className="text-2xl font-bold mb-8">{restaurant.name}</h1>

        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            { label: 'Recetas', value: recipeCount || 0 },
            { label: 'Ingredientes', value: ingredientCount || 0 },
            { label: 'Facturas', value: invoiceCount || 0 },
          ].map(kpi => (
            <div key={kpi.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 text-center">
              <p className="text-3xl font-bold">{kpi.value}</p>
              <p className="text-slate-400 text-sm mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mb-6">
          <h2 className="font-semibold mb-4">Información</h2>
          <div className="grid grid-cols-2 gap-4 text-sm">
            {[
              { label: 'Email', value: restaurant.owner_email },
              { label: 'Plan', value: restaurant.plan },
              { label: 'Estado', value: restaurant.active ? 'Activo' : 'Inactivo' },
              { label: 'Creado', value: new Date(restaurant.created_at).toLocaleDateString('es-AR') },
            ].map(f => (
              <div key={f.label}>
                <p className="text-slate-400 text-xs mb-0.5">{f.label}</p>
                <p className="text-white font-medium">{f.value}</p>
              </div>
            ))}
          </div>
        </div>

        <AdminRestaurantActions restaurant={restaurant} />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <h2 className="font-semibold mb-4">Usuarios</h2>
          <div className="space-y-2">
            {(profiles || []).map(p => (
              <div key={p.id} className="flex items-center justify-between py-2 border-b border-slate-800 last:border-0">
                <p className="text-slate-300 text-sm">{p.full_name || 'Sin nombre'}</p>
                <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{p.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
