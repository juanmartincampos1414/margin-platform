import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { requireRestaurant } from '@/lib/auth'
import { normalizeIngredientName } from '@/lib/utils'

// PUT /api/menu/item/:id — editar categoría/producto/precio. recipe_id is
// only ever set here in response to an explicit user action (e.g. clicking
// "Vincular receta") — never populated automatically during parsing.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const supabase = await createClient()
  const body = await req.json()
  const { name, category_id, selling_price, recipe_id, status } = body

  const payload: Record<string, unknown> = {}
  if (name !== undefined) {
    payload.name = name
    payload.normalized_name = normalizeIngredientName(name)
  }
  if (category_id !== undefined) payload.category_id = category_id
  if (selling_price !== undefined) payload.selling_price = selling_price
  if (recipe_id !== undefined) payload.recipe_id = recipe_id
  if (status !== undefined) payload.status = status

  const { data, error } = await supabase
    .from('menu_items')
    .update(payload)
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select('*, menu_categories(id, name), recipes(id, name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/menu/item/:id — archivar producto (nunca hard delete).
export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('menu_items')
    .update({ status: 'archived' })
    .eq('id', id)
    .eq('restaurant_id', restaurantId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
