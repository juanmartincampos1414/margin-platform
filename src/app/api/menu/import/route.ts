import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireRestaurant } from '@/lib/auth'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]

// FR-026 Menu Import — accepts PDF, JPG, PNG, XLSX, CSV.
export async function POST(req: Request) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  // service-role is only used here for the Storage write — restaurantId
  // itself is never trusted from the client, it's resolved from the
  // session above.
  const adminSupabase = getAdminClient()
  const formData = await req.formData()
  const file = formData.get('file') as File

  if (!file) {
    return NextResponse.json({ error: 'Missing file' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Unsupported file type. Use PDF, JPG, PNG, XLSX or CSV.' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()

  try {
    const storagePath = `${restaurantId}/${Date.now()}_${file.name}`
    const { error: uploadError } = await adminSupabase.storage
      .from('menus')
      .upload(storagePath, bytes, { contentType: file.type })

    if (uploadError) throw uploadError

    const { data: { publicUrl } } = adminSupabase.storage.from('menus').getPublicUrl(storagePath)

    const { data: menuImport, error: insertError } = await adminSupabase
      .from('menu_imports')
      .insert({
        restaurant_id: restaurantId,
        file_name: file.name,
        file_type: file.type,
        file_url: publicUrl,
        status: 'uploaded',
      })
      .select()
      .single()

    if (insertError) throw insertError

    return NextResponse.json(menuImport)
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
