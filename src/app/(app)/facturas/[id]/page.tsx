import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

export default async function FacturaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('restaurant_id')
    .eq('id', user.id)
    .single()

  const { data: invoice } = await supabase
    .from('invoices')
    .select('*, invoice_items(*)')
    .eq('id', id)
    .eq('restaurant_id', profile?.restaurant_id)
    .single()

  if (!invoice) notFound()

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/facturas" className="hover:text-slate-600">Facturas</Link>
        <span>›</span>
        <span className="text-slate-600">{invoice.file_name || 'Factura'}</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between mb-6">
          <h1 className="text-xl font-bold text-slate-900">{invoice.supplier_name || 'Proveedor desconocido'}</h1>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">${Number(invoice.total_amount || 0).toLocaleString('es-AR')}</p>
            <p className="text-slate-400 text-sm">Total factura</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          {[
            { label: 'CUIT', value: invoice.supplier_cuit },
            { label: 'N° Factura', value: invoice.invoice_number },
            { label: 'Fecha', value: invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('es-AR') : null },
            { label: 'Confianza OCR', value: invoice.ocr_confidence ? `${invoice.ocr_confidence}%` : null },
          ].map(f => (
            <div key={f.label}>
              <p className="text-slate-400 text-xs mb-0.5">{f.label}</p>
              <p className="font-medium text-slate-800">{f.value || '—'}</p>
            </div>
          ))}
        </div>
      </div>

      {invoice.invoice_items?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Productos detectados</h2>
          <div className="space-y-2">
            {invoice.invoice_items.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{item.product_name}</p>
                  {item.quantity && <p className="text-slate-400 text-xs">{item.quantity} {item.unit}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800 text-sm">${Number(item.unit_price || 0).toLocaleString('es-AR')}/{item.unit}</p>
                  {item.price_change_pct && Math.abs(item.price_change_pct) > 0.5 && (
                    <p className={`text-xs font-medium ${item.price_change_pct > 0 ? 'text-red-500' : 'text-emerald-500'}`}>
                      {item.price_change_pct > 0 ? '▲' : '▼'} {Math.abs(item.price_change_pct).toFixed(1)}% vs precio anterior
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
