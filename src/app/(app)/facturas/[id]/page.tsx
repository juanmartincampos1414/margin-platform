import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import InvoiceActions from './InvoiceActions'

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
    .select('*, invoice_lines(*), suppliers(name, tax_id, payment_terms)')
    .eq('id', id)
    .eq('restaurant_id', profile?.restaurant_id)
    .single()

  if (!invoice || invoice.status === 'deleted') notFound()

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

  const canDelete = ['failed', 'review_required', 'uploaded'].includes(invoice.status)

  return (
    <div className="p-8 max-w-3xl">
      <div className="flex items-center gap-2 text-slate-400 text-sm mb-6">
        <Link href="/facturas" className="hover:text-slate-600">Facturas</Link>
        <span>›</span>
        <span className="text-slate-600">{invoice.file_name || 'Factura'}</span>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-6 mb-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-slate-900">{invoice.supplier_name || 'Proveedor desconocido'}</h1>
            <span className={`inline-block mt-2 text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[invoice.status] || 'bg-slate-100 text-slate-600'}`}>
              {statusLabels[invoice.status] || invoice.status}
            </span>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-slate-900">${Number(invoice.total_amount || 0).toLocaleString('es-AR')}</p>
            <p className="text-slate-400 text-sm">Total factura</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 text-sm mb-6">
          {[
            { label: 'CUIT', value: invoice.supplier_cuit },
            { label: 'N° Factura', value: invoice.invoice_number },
            { label: 'Fecha', value: invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('es-AR') : null },
            { label: 'Vencimiento', value: invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('es-AR') : null },
            { label: 'Confianza OCR', value: invoice.ocr_confidence ? `${invoice.ocr_confidence}%` : null },
            { label: 'Condición de pago', value: invoice.suppliers?.payment_terms },
          ].map(f => (
            <div key={f.label}>
              <p className="text-slate-400 text-xs mb-0.5">{f.label}</p>
              <p className="font-medium text-slate-800">{f.value || '—'}</p>
            </div>
          ))}
        </div>

        {/* File access + actions */}
        <div className="flex items-center gap-3 pt-4 border-t border-slate-100">
          {invoice.file_url && (
            <>
              <a
                href={invoice.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sm text-indigo-600 hover:text-indigo-700 font-medium"
              >
                📄 Ver original
              </a>
              <a
                href={invoice.file_url}
                download
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700"
              >
                ⬇ Descargar
              </a>
            </>
          )}
          {canDelete && (
            <InvoiceActions invoiceId={invoice.id} />
          )}
        </div>
      </div>

      {invoice.status === 'review_required' && (
        <div className="bg-orange-50 border border-orange-200 text-orange-700 rounded-xl px-4 py-3 text-sm mb-6">
          La confianza del OCR fue baja. Revisá los ingredientes detectados y corregilos en{' '}
          <Link href="/ingredientes" className="font-medium underline">Ingredient Master</Link> si es necesario.
        </div>
      )}

      {invoice.invoice_lines?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6">
          <h2 className="font-semibold text-slate-900 mb-4">Ingredientes detectados</h2>
          <div className="space-y-2">
            {invoice.invoice_lines.map((item: any) => (
              <div key={item.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                <div>
                  <p className="font-medium text-slate-800 text-sm">{item.ingredient_name}</p>
                  {item.quantity && <p className="text-slate-400 text-xs">{item.quantity} {item.unit}</p>}
                </div>
                <div className="text-right">
                  <p className="font-semibold text-slate-800 text-sm">${Number(item.unit_price || 0).toLocaleString('es-AR')}/{item.unit}</p>
                  {item.units_per_pack > 1 && (
                    <p className="text-slate-400 text-xs">de ${Number(item.pack_price || 0).toLocaleString('es-AR')} el paquete x{item.units_per_pack}</p>
                  )}
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
