import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// PATCH: update a single recipe_import_item (confirm/reject/edit ingredients).
// User corrections are logged to ocr_corrections for the OCR Learning Layer.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id: importId } = await params

  const supabase = await createClient()
  const adminSupabase = getAdminClient()

  const { itemId, status, proposed_name, proposed_sale_price, proposed_portions, raw_ingredients, corrections } = await req.json()
  if (!itemId) return NextResponse.json({ error: 'Missing itemId' }, { status: 400 })

  // Verify ownership
  const { data: item } = await supabase
    .from('recipe_import_items')
    .select('id, import_id')
    .eq('id', itemId)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!item || item.import_id !== importId) {
    return NextResponse.json({ error: 'Item not found' }, { status: 404 })
  }

  const updates: Record<string, any> = {}
  if (status) updates.status = status
  if (proposed_name !== undefined) updates.proposed_name = proposed_name
  if (proposed_sale_price !== undefined) updates.proposed_sale_price = proposed_sale_price
  if (proposed_portions !== undefined) updates.proposed_portions = proposed_portions
  if (raw_ingredients !== undefined) updates.raw_ingredients = raw_ingredients

  const { data, error } = await supabase
    .from('recipe_import_items')
    .update(updates)
    .eq('id', itemId)
    .eq('restaurant_id', restaurantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Log corrections to OCR Learning Layer
  if (corrections && Array.isArray(corrections) && corrections.length > 0) {
    await adminSupabase.from('ocr_corrections').insert(
      corrections.map((c: any) => ({
        restaurant_id: restaurantId,
        correction_type: c.type,
        source_module: 'recipe_import',
        import_id: importId,
        original_value: c.original,
        corrected_value: c.corrected,
        original_match_id: c.original_match_id || null,
        corrected_match_id: c.corrected_match_id || null,
      }))
    )
  }

  return NextResponse.json(data)
}
