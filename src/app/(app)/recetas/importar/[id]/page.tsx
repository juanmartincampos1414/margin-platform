import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import RecipeImportReview from './RecipeImportReview'

export default async function RecipeImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const [{ data: importRow }, { data: items }, { data: ingredients }, { data: menuItems }] = await Promise.all([
    supabase.from('recipe_imports').select('*').eq('id', id).eq('restaurant_id', profile?.restaurant_id).single(),
    supabase.from('recipe_import_items').select('*').eq('import_id', id).eq('restaurant_id', profile?.restaurant_id).order('created_at'),
    supabase.from('ingredients').select('id, name, unit, current_price').eq('restaurant_id', profile?.restaurant_id).neq('status', 'archived').order('name'),
    supabase.from('menu_items').select('id, name, recipe_id').eq('restaurant_id', profile?.restaurant_id).eq('status', 'active').order('name'),
  ])

  if (!importRow) notFound()

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/recetas" className="hover:text-slate-600">Recetas</Link>
        <span>›</span>
        <Link href="/recetas/importar" className="hover:text-slate-600">Importar</Link>
        <span>›</span>
        <span className="text-slate-600">{importRow.file_name}</span>
      </div>

      <RecipeImportReview
        importId={id}
        importRow={importRow}
        items={items || []}
        ingredients={ingredients || []}
        menuItems={menuItems || []}
      />
    </div>
  )
}
