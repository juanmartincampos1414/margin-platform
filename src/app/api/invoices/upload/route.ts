import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurant } from '@/lib/auth'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  // service-role is only used here for the Storage write, which the
  // session-scoped client can't do directly — restaurantId itself is
  // never trusted from the client, it's resolved from the session above.
  const adminSupabase = getAdminClient()
  const formData = await req.formData()
  const file = formData.get('file') as File

  if (!file) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png']
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type. Use PDF, JPG or PNG.' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()

  try {
    const fileName = `${restaurantId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await adminSupabase.storage
      .from('invoices')
      .upload(fileName, bytes, { contentType: file.type })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = adminSupabase.storage.from('invoices').getPublicUrl(fileName)

    const { data: invoice, error: insertError } = await adminSupabase
      .from('invoices')
      .insert({
        restaurant_id: restaurantId,
        file_url: publicUrl,
        file_name: file.name,
        status: 'uploaded',
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ invoiceId: invoice.id, status: invoice.status })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
