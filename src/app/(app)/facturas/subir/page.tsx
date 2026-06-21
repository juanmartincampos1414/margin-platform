import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import UploadInvoice from './UploadInvoice'

export default async function SubirFacturaPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="p-8 max-w-2xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900">Subir factura</h1>
        <p className="text-slate-500 mt-1">La IA extrae automáticamente todos los datos del documento.</p>
      </div>
      <UploadInvoice />
    </div>
  )
}
