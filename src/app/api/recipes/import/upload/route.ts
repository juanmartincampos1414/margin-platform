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

  const formData = await req.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
  const sourceType = ['pdf'].includes(ext) ? 'pdf'
    : ['xlsx', 'xls', 'csv'].includes(ext) ? (ext === 'csv' ? 'csv' : 'excel')
    : 'image'

  const fileName = `recipe-imports/${restaurantId}/${Date.now()}.${ext}`
  const adminSupabase = getAdminClient()

  const buffer = Buffer.from(await file.arrayBuffer())
  const { error: uploadError } = await adminSupabase.storage
    .from('invoices')
    .upload(fileName, buffer, { contentType: file.type, upsert: false })

  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 })

  const { data: { publicUrl } } = adminSupabase.storage.from('invoices').getPublicUrl(fileName)

  const { data: importRow, error } = await adminSupabase
    .from('recipe_imports')
    .insert({
      restaurant_id: restaurantId,
      file_name: file.name,
      file_url: publicUrl,
      source_type: sourceType,
      status: 'uploaded',
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(importRow)
}
