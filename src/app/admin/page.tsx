import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/server'

const planColors: Record<string, string> = {
  trial: 'bg-yellow-100 text-yellow-700',
  basic: 'bg-blue-100 text-blue-700',
  pro: 'bg-indigo-100 text-indigo-700',
  enterprise: 'bg-purple-100 text-purple-700',
}

export default async function AdminPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') redirect('/dashboard')

  const admin = await createAdminClient()

  const { data: restaurants } = await admin
    .from('restaurants')
    .select('*, profiles(count)')
    .order('created_at', { ascending: false })

  const { count: totalRestaurants } = await admin
    .from('restaurants')
    .select('*', { count: 'exact', head: true })

  const { count: activeRestaurants } = await admin
    .from('restaurants')
    .select('*', { count: 'exact', head: true })
    .eq('active', true)

  const { count: totalRecipes } = await admin
    .from('recipes')
    .select('*', { count: 'exact', head: true })

  const { count: totalInvoices } = await admin
    .from('invoices')
    .select('*', { count: 'exact', head: true })

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Admin nav */}
      <nav className="border-b border-slate-800 px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-sm">M</div>
          <span className="font-bold">Margin</span>
          <span className="text-slate-500 text-sm">/ Admin</span>
        </div>
        <Link href="/dashboard" className="text-slate-400 hover:text-white text-sm transition-colors">
          ← Volver al app
        </Link>
      </nav>

      <div className="p-8">
        <h1 className="text-2xl font-bold mb-2">Panel de Administración</h1>
        <p className="text-slate-400 mb-8">Gestión global de la plataforma Margin</p>

        {/* Global KPIs */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {[
            { label: 'Restaurantes totales', value: totalRestaurants || 0, icon: '🏪' },
            { label: 'Restaurantes activos', value: activeRestaurants || 0, icon: '✅' },
            { label: 'Recetas creadas', value: totalRecipes || 0, icon: '🍽' },
            { label: 'Facturas procesadas', value: totalInvoices || 0, icon: '📄' },
          ].map(kpi => (
            <div key={kpi.label} className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
              <span className="text-2xl">{kpi.icon}</span>
              <p className="text-3xl font-bold mt-3">{kpi.value}</p>
              <p className="text-slate-400 text-sm mt-1">{kpi.label}</p>
            </div>
          ))}
        </div>

        {/* Restaurants table */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
            <h2 className="font-semibold">Restaurantes</h2>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Restaurante</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Email</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Plan</th>
                <th className="text-center px-4 py-3 text-slate-400 font-medium">Estado</th>
                <th className="text-left px-4 py-3 text-slate-400 font-medium">Creado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {(restaurants || []).map(rest => (
                <tr key={rest.id} className="hover:bg-slate-800/30">
                  <td className="px-4 py-3">
                    <p className="font-medium text-white">{rest.name}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{rest.owner_email}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planColors[rest.plan] || 'bg-slate-700 text-slate-300'}`}>
                      {rest.plan}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${rest.active ? 'bg-emerald-900 text-emerald-300' : 'bg-red-900 text-red-300'}`}>
                      {rest.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">
                    {new Date(rest.created_at).toLocaleDateString('es-AR')}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/admin/restaurantes/${rest.id}`} className="text-indigo-400 hover:text-indigo-300 text-sm transition-colors">
                      Ver →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
