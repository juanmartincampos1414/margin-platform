import { NextResponse } from 'next/server'
import { requireRestaurant } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const auth = await requireRestaurant()
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })
  const { restaurantId } = auth

  const supabase = await createClient()

  const [{ data: suppliers }, { data: invoices }, { data: phRows }] = await Promise.all([
    supabase
      .from('suppliers')
      .select('id, name, supplier_metrics(health_score, risk_level, monthly_variation_pct)')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'active'),
    supabase
      .from('invoices')
      .select('id, supplier_id, total_amount')
      .eq('restaurant_id', restaurantId),
    supabase
      .from('price_history')
      .select('supplier_id, ingredient_id')
      .eq('restaurant_id', restaurantId),
  ])

  const spendBySupplier = new Map<string, number>()
  const invoiceCountBySupplier = new Map<string, number>()
  for (const inv of invoices || []) {
    if (!inv.supplier_id) continue
    spendBySupplier.set(inv.supplier_id, (spendBySupplier.get(inv.supplier_id) || 0) + Number(inv.total_amount || 0))
    invoiceCountBySupplier.set(inv.supplier_id, (invoiceCountBySupplier.get(inv.supplier_id) || 0) + 1)
  }

  const ingredientsBySupplier = new Map<string, Set<string>>()
  for (const row of phRows || []) {
    if (!row.supplier_id) continue
    if (!ingredientsBySupplier.has(row.supplier_id)) ingredientsBySupplier.set(row.supplier_id, new Set())
    ingredientsBySupplier.get(row.supplier_id)!.add(row.ingredient_id)
  }

  const rows = (suppliers || []).map((s: any) => {
    const metricsRaw = Array.isArray(s.supplier_metrics) ? s.supplier_metrics[0] : s.supplier_metrics
    return {
      id: s.id,
      name: s.name,
      health_score: metricsRaw?.health_score ?? null,
      risk_level: metricsRaw?.risk_level ?? null,
      monthly_variation_pct: metricsRaw?.monthly_variation_pct ?? null,
      total_spend: spendBySupplier.get(s.id) || 0,
      invoice_count: invoiceCountBySupplier.get(s.id) || 0,
      // Primary ranking key: distinct ingredients (per blueprint decision);
      // secondary: invoice count.
      ingredient_count: ingredientsBySupplier.get(s.id)?.size || 0,
    }
  })

  // Most Stable: highest health_score (price_stability drives it)
  const mostStable = [...rows]
    .filter(r => r.health_score !== null)
    .sort((a, b) => b.health_score - a.health_score)
    .slice(0, 10)

  // Most Volatile: lowest health_score
  const mostVolatile = [...rows]
    .filter(r => r.health_score !== null)
    .sort((a, b) => a.health_score - b.health_score)
    .slice(0, 10)

  // Highest Impact: highest total spend (economic weight)
  const highestImpact = [...rows]
    .sort((a, b) => b.total_spend - a.total_spend)
    .slice(0, 10)

  // Most Used: primary = ingredient_count, secondary = invoice_count
  const mostUsed = [...rows]
    .sort((a, b) => b.ingredient_count - a.ingredient_count || b.invoice_count - a.invoice_count)
    .slice(0, 10)

  return NextResponse.json({ mostStable, mostVolatile, highestImpact, mostUsed })
}
