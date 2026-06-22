import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { normalizeIngredientName } from '@/lib/utils'

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST: materialize all 'confirmed' recipe_import_items into real recipes + recipe_ingredients.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth
  const { id: importId } = await params

  const supabase = await createClient()
  const adminSupabase = getAdminClient()

  const { data: importRow } = await supabase
    .from('recipe_imports')
    .select('*')
    .eq('id', importId)
    .eq('restaurant_id', restaurantId)
    .single()

  if (!importRow) return NextResponse.json({ error: 'Import not found' }, { status: 404 })

  const { data: items } = await supabase
    .from('recipe_import_items')
    .select('*')
    .eq('import_id', importId)
    .eq('restaurant_id', restaurantId)
    .eq('status', 'confirmed')

  if (!items || items.length === 0) {
    return NextResponse.json({ error: 'No confirmed items to materialize' }, { status: 400 })
  }

  // Ingredient lookup
  const { data: existingIngredients } = await adminSupabase
    .from('ingredients')
    .select('id, normalized_name')
    .eq('restaurant_id', restaurantId)

  const ingredientByNorm = new Map<string, string>()
  for (const ing of existingIngredients || []) {
    ingredientByNorm.set(ing.normalized_name, ing.id)
  }

  const createdRecipes: { id: string; name: string }[] = []

  for (const item of items) {
    const rawIngredients: any[] = item.raw_ingredients || []

    // Create the recipe
    const { data: newRecipe } = await adminSupabase
      .from('recipes')
      .insert({
        restaurant_id: restaurantId,
        name: item.proposed_name,
        sale_price: item.proposed_sale_price || 0,
        portions: item.proposed_portions || 1,
        status: 'active',
        source_type: importRow.source_type === 'excel' ? 'excel'
          : importRow.source_type === 'csv' ? 'csv'
          : importRow.source_type === 'pdf' ? 'pdf'
          : 'ocr',
      })
      .select('id')
      .single()

    if (!newRecipe) continue

    // Create recipe_ingredients, creating missing ingredients as drafts
    const recipeIngredientRows: any[] = []
    for (const ing of rawIngredients) {
      if (!ing.name) continue
      const norm = normalizeIngredientName(ing.name)
      let ingredientId = ing.matched_ingredient_id || ingredientByNorm.get(norm)

      if (!ingredientId) {
        const { data: created } = await adminSupabase
          .from('ingredients')
          .insert({
            restaurant_id: restaurantId,
            name: ing.name,
            normalized_name: norm,
            unit: ing.unit || 'kg',
            current_price: 0,
            status: 'draft',
          })
          .select('id')
          .single()
        if (created) {
          ingredientId = created.id
          ingredientByNorm.set(norm, ingredientId)
        }
      }

      if (ingredientId) {
        recipeIngredientRows.push({
          recipe_id: newRecipe.id,
          ingredient_id: ingredientId,
          quantity: ing.quantity || 0,
          unit: ing.unit || 'kg',
        })
      }
    }

    if (recipeIngredientRows.length > 0) {
      await adminSupabase.from('recipe_ingredients').insert(recipeIngredientRows)
    }

    // Link menu item if this was a duplicate match that the user confirmed
    if (item.matched_recipe_id) {
      // User confirmed against an existing recipe — link it to any menu_item
      // that references the matched recipe but no new recipe was created for the menu item
      // (no auto-link here — just update the import_item's created_recipe_id)
    }

    // Update the item with the created recipe id
    await adminSupabase
      .from('recipe_import_items')
      .update({ created_recipe_id: newRecipe.id, status: 'confirmed' })
      .eq('id', item.id)

    createdRecipes.push({ id: newRecipe.id, name: item.proposed_name })
  }

  // Mark import as confirmed
  await adminSupabase.from('recipe_imports').update({
    status: 'confirmed',
    imported_recipe_count: createdRecipes.length,
  }).eq('id', importId)

  return NextResponse.json({ created: createdRecipes.length, recipes: createdRecipes })
}
