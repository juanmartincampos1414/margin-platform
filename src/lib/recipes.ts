interface RecipeIngredientForCost {
  quantity: number
  unit: string
  ingredients?: { current_price: number; unit: string } | { current_price: number; unit: string }[] | null
}

function getIngredient(ri: RecipeIngredientForCost) {
  return Array.isArray(ri.ingredients) ? ri.ingredients[0] : ri.ingredients
}

export function calculateLineCost(ri: RecipeIngredientForCost): number {
  const ingredient = getIngredient(ri)
  if (!ingredient) return 0
  const ratio = (ri.unit === 'gr' && ingredient.unit === 'kg') ||
                (ri.unit === 'ml' && ingredient.unit === 'lt') ? 1000 : 1
  return ri.quantity * ingredient.current_price / ratio
}

// Single source of truth for recipe cost — used by /recetas, /recetas/[id],
// and Menu Intelligence's profitability display. Cost is always computed
// live from current ingredient prices, never cached/stored.
export function calculateRecipeCost(recipeIngredients: RecipeIngredientForCost[] | null | undefined): number {
  return (recipeIngredients || []).reduce((sum, ri) => sum + calculateLineCost(ri), 0)
}

export interface ProfitabilityMetrics {
  cost: number
  foodCostPct: number
  grossMarginPct: number
  grossProfit: number
}

export function calculateProfitability(sellingPrice: number, cost: number): ProfitabilityMetrics {
  const foodCostPct = sellingPrice > 0 ? (cost / sellingPrice) * 100 : 0
  const grossMarginPct = sellingPrice > 0 ? ((sellingPrice - cost) / sellingPrice) * 100 : 0
  const grossProfit = sellingPrice - cost
  return { cost, foodCostPct, grossMarginPct, grossProfit }
}
