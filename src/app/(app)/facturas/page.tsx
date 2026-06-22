import { redirect } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

const statusLabels: Record<string, string> = {
  uploaded: 'Subida',
  processing: 'Procesando',
  processed: 'Procesada',
  review_required: 'Revisión requerida',
  failed: 'Falló',
}
const statusColors: Record<string, string> = {
  uploaded: 'bg-slate-100 text-slate-600',
  processing: 'bg-yellow-100 text-yellow-700',
  processed: 'bg-emerald-100 text-emerald-700',
  review_required: 'bg-orange-100 text-orange-700',
  failed: 'bg-red-100 text-red-700',
}

export default async function FacturasPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: invoices } = await supabase
    .from('invoices')
    .select('id, file_name, supplier_name, invoice_number, invoice_date, total_amount, status, ocr_confidence, created_at')
    .eq('restaurant_id', profile?.restaurant_id)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Facturas OCR</h1>
          <p className="text-slate-500 mt-1">Extraé datos de facturas automáticamente con IA</p>
        </div>
        <Link href="/facturas/subir" className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
          + Subir factura
        </Link>
      </div>

      {(!invoices || invoices.length === 0) ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-16 text-center">
          <p className="text-5xl mb-4">📄</p>
          <h3 className="font-semibold text-slate-900 mb-2">No hay facturas aún</h3>
          <p className="text-slate-500 text-sm mb-6">Subí una foto o PDF de factura de proveedor y la IA extraerá los datos automáticamente.</p>
          <Link href="/facturas/subir" className="bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors">
            Subir primera factura
          </Link>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Archivo</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Proveedor</th>
                <th className="text-left px-4 py-3 text-slate-500 font-medium">Fecha</th>
                <th className="text-right px-4 py-3 text-slate-500 font-medium">Total</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Confianza</th>
                <th className="text-center px-4 py-3 text-slate-500 font-medium">Estado</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {invoices.map(inv => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800 truncate max-w-[160px]">{inv.file_name || 'Factura'}</p>
                    {inv.invoice_number && <p className="text-slate-400 text-xs">{inv.invoice_number}</p>}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{inv.supplier_name || '—'}</td>
                  <td className="px-4 py-3 text-slate-600">{inv.invoice_date ? new Date(inv.invoice_date).toLocaleDateString('es-AR') : '—'}</td>
                  <td className="px-4 py-3 text-right font-semibold text-slate-900">
                    {inv.total_amount ? `$${Number(inv.total_amount).toLocaleString('es-AR')}` : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {inv.ocr_confidence ? (
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${inv.ocr_confidence >= 80 ? 'bg-emerald-100 text-emerald-700' : 'bg-yellow-100 text-yellow-700'}`}>
                        {inv.ocr_confidence}%
                      </span>
                    ) : '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[inv.status] || 'bg-slate-100 text-slate-600'}`}>
                      {statusLabels[inv.status] || inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link href={`/facturas/${inv.id}`} className="text-indigo-600 hover:text-indigo-700 text-sm">Ver →</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
