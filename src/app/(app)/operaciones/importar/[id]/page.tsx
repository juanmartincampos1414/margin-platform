import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import OperationsImportReview from './OperationsImportReview'

export default async function OperationsImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const [{ data: importRow }, { data: operations }] = await Promise.all([
    supabase.from('operations_imports').select('*').eq('id', id).eq('restaurant_id', profile?.restaurant_id).single(),
    supabase
      .from('daily_operations')
      .select('*, daily_product_mix(id, item_name, quantity_sold, total_revenue)')
      .eq('import_id', id)
      .eq('restaurant_id', profile?.restaurant_id)
      .order('operation_date'),
  ])

  if (!importRow) notFound()

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/operaciones" className="hover:text-slate-600">Operaciones</Link>
        <span>›</span>
        <Link href="/operaciones/importar" className="hover:text-slate-600">Importar</Link>
        <span>›</span>
        <span className="text-slate-600">{importRow.file_name}</span>
      </div>

      <OperationsImportReview
        importId={id}
        importRow={importRow}
        operations={operations || []}
      />
    </div>
  )
}
