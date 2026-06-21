import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ReviewMenu from './ReviewMenu'

export default async function RevisarMenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: menuImport } = await supabase
    .from('menu_imports')
    .select('*')
    .eq('id', id)
    .eq('restaurant_id', profile?.restaurant_id)
    .single()

  if (!menuImport) notFound()

  const { data: items } = await supabase
    .from('menu_items')
    .select('*, menu_categories(id, name)')
    .eq('menu_import_id', id)
    .eq('restaurant_id', profile?.restaurant_id)
    .neq('status', 'archived')
    .order('name')

  const { data: categories } = await supabase
    .from('menu_categories')
    .select('id, name')
    .eq('restaurant_id', profile?.restaurant_id)
    .order('name')

  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Revisar carta</h1>
        <p className="text-slate-500 mt-1">{menuImport.file_name} — revisá categorías, productos y precios antes de confirmar.</p>
      </div>
      <ReviewMenu importId={id} items={items || []} categories={categories || []} />
    </div>
  )
}
