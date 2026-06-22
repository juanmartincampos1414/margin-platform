// Sprint 06: Supplier Intelligence — core calculation engine.
// Every input here comes from data Margin already has (price_history,
// invoices, invoice_lines, recipe_ingredients, menu_items) — per the
// spec's own constraint, nothing here collects new data or talks to
// suppliers. MVP weights/thresholds are intentionally simple and
// documented inline — the spec itself says the formula should become
// configurable later, not that it needs to be sophisticated now.

const OPPORTUNITY_THRESHOLD_PCT = 15

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}

function stddev(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((s, v) => s + v, 0) / values.length
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

interface PriceHistoryRow {
  ingredient_id: string
  price: number
  invoice_date: string | null
  recorded_at: string
}

interface InvoiceRow {
  id: string
  invoice_date: string | null
}

// Price Stability (40%) — lower volatility in % price changes per
// ingredient over time scores higher. A supplier with flat prices
// scores near 100; one with wide swings scores low.
function calcPriceStability(priceHistory: PriceHistoryRow[]): number {
  const byIngredient = new Map<string, PriceHistoryRow[]>()
  for (const row of priceHistory) {
    if (!byIngredient.has(row.ingredient_id)) byIngredient.set(row.ingredient_id, [])
    byIngredient.get(row.ingredient_id)!.push(row)
  }

  const pctChanges: number[] = []
  for (const rows of byIngredient.values()) {
    const sorted = [...rows].sort((a, b) => (a.invoice_date || a.recorded_at).localeCompare(b.invoice_date || b.recorded_at))
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1].price
      const curr = sorted[i].price
      if (prev > 0) pctChanges.push(((curr - prev) / prev) * 100)
    }
  }

  if (pctChanges.length === 0) return 100 // no history to judge yet — don't penalize
  return clamp(100 - stddev(pctChanges), 0, 100)
}

// Invoice Frequency (30%) — average days between invoices in the last
// 90 days, scored against a "monthly or better" cadence target.
function calcInvoiceFrequency(invoices: InvoiceRow[]): number {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const recentDates = invoices
    .map(i => i.invoice_date)
    .filter((d): d is string => !!d && new Date(d) >= ninetyDaysAgo)
    .sort()

  if (recentDates.length === 0) return 0
  if (recentDates.length === 1) return 30 // some signal, but too little to call frequent

  const gaps: number[] = []
  for (let i = 1; i < recentDates.length; i++) {
    const days = (new Date(recentDates[i]).getTime() - new Date(recentDates[i - 1]).getTime()) / 86400000
    gaps.push(days)
  }
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length
  // <=30 days between invoices -> 100, scaling down to 0 at >=90 days
  return clamp(100 - ((avgGap - 30) / 60) * 100, 0, 100)
}

// Product Coverage (20%) — how central this supplier is to the
// restaurant's overall sourcing, relative to its single largest supplier
// (not an absolute ingredient count, which means nothing on its own).
function calcProductCoverage(supplierIngredientCount: number, maxIngredientCountAcrossSuppliers: number): number {
  if (maxIngredientCountAcrossSuppliers === 0) return 0
  return clamp((supplierIngredientCount / maxIngredientCountAcrossSuppliers) * 100, 0, 100)
}

// Historical Consistency (10%) — % of months since the first invoice
// from this supplier that actually had at least one invoice. Catches a
// supplier the restaurant only orders from sporadically.
function calcHistoricalConsistency(invoices: InvoiceRow[]): number {
  const dates = invoices.map(i => i.invoice_date).filter((d): d is string => !!d).sort()
  if (dates.length === 0) return 100 // no history yet — don't penalize
  const first = new Date(dates[0])
  const now = new Date()
  const monthsSinceFirst = Math.max(1, (now.getFullYear() - first.getFullYear()) * 12 + (now.getMonth() - first.getMonth()) + 1)

  const monthsWithInvoice = new Set(dates.map(d => d.slice(0, 7))) // "YYYY-MM"
  return clamp((monthsWithInvoice.size / monthsSinceFirst) * 100, 0, 100)
}

export interface SupplierMetricsInput {
  priceHistory: PriceHistoryRow[]
  invoices: InvoiceRow[]
  supplierIngredientCount: number
  maxIngredientCountAcrossSuppliers: number
}

export interface SupplierMetricsResult {
  healthScore: number
  riskLevel: 'low' | 'medium' | 'high'
  monthlyVariationPct: number
}

export function calculateSupplierMetrics(input: SupplierMetricsInput): SupplierMetricsResult {
  const priceStability = calcPriceStability(input.priceHistory)
  const invoiceFrequency = calcInvoiceFrequency(input.invoices)
  const productCoverage = calcProductCoverage(input.supplierIngredientCount, input.maxIngredientCountAcrossSuppliers)
  const historicalConsistency = calcHistoricalConsistency(input.invoices)

  const healthScore = clamp(
    priceStability * 0.4 + invoiceFrequency * 0.3 + productCoverage * 0.2 + historicalConsistency * 0.1,
    0,
    100
  )

  const monthlyVariationPct = calcMonthlyVariation(input.priceHistory)

  // Risk Level starts from the score, then can only be escalated (never
  // lowered) by FR-039's explicit red flags — a high score shouldn't
  // hide a sudden, sharp price jump or a supplier that's gone quiet.
  let riskLevel: 'low' | 'medium' | 'high' = healthScore >= 70 ? 'low' : healthScore >= 40 ? 'medium' : 'high'

  const daysSinceLastInvoice = lastInvoiceAgeDays(input.invoices)
  if (Math.abs(monthlyVariationPct) >= OPPORTUNITY_THRESHOLD_PCT) riskLevel = escalate(riskLevel, 'medium')
  if (priceStability < 50) riskLevel = escalate(riskLevel, 'medium')
  if (daysSinceLastInvoice !== null && daysSinceLastInvoice > 60) riskLevel = escalate(riskLevel, 'medium')
  if (daysSinceLastInvoice !== null && daysSinceLastInvoice > 120) riskLevel = escalate(riskLevel, 'high')

  return { healthScore: Math.round(healthScore * 100) / 100, riskLevel, monthlyVariationPct }
}

function escalate(current: 'low' | 'medium' | 'high', floor: 'low' | 'medium' | 'high') {
  const rank = { low: 0, medium: 1, high: 2 }
  return rank[floor] > rank[current] ? floor : current
}

function lastInvoiceAgeDays(invoices: InvoiceRow[]): number | null {
  const dates = invoices.map(i => i.invoice_date).filter((d): d is string => !!d).sort()
  if (dates.length === 0) return null
  const last = dates[dates.length - 1]
  return (new Date().getTime() - new Date(last).getTime()) / 86400000
}

// Monthly Variation — current calendar month's average unit price vs the
// previous calendar month's, across all of this supplier's ingredients.
function calcMonthlyVariation(priceHistory: PriceHistoryRow[]): number {
  const now = new Date()
  const currentMonth = now.toISOString().slice(0, 7)
  const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const prevMonth = prevDate.toISOString().slice(0, 7)

  const inMonth = (month: string) =>
    priceHistory.filter(r => (r.invoice_date || r.recorded_at).slice(0, 7) === month)

  const avg = (rows: PriceHistoryRow[]) => rows.length ? rows.reduce((s, r) => s + r.price, 0) / rows.length : null

  const currentAvg = avg(inMonth(currentMonth))
  const prevAvg = avg(inMonth(prevMonth))

  if (currentAvg == null || prevAvg == null || prevAvg === 0) return 0
  return Math.round(((currentAvg - prevAvg) / prevAvg) * 10000) / 100
}

// FR-040 Opportunity Detection — compares each ingredient's latest price
// to its immediately prior price (not bound to calendar months), flags
// increases at or above the threshold, and estimates the economic impact
// in pesos per month (Design Requirement: show money, not just percent).
export interface OpportunityCandidate {
  ingredientId: string
  ingredientName: string
  priceChangePct: number
  impactValue: number
}

export function detectOpportunities(
  priceHistory: (PriceHistoryRow & { ingredient_name: string })[],
  monthlyQuantityByIngredient: Map<string, number>
): OpportunityCandidate[] {
  const byIngredient = new Map<string, (PriceHistoryRow & { ingredient_name: string })[]>()
  for (const row of priceHistory) {
    if (!byIngredient.has(row.ingredient_id)) byIngredient.set(row.ingredient_id, [])
    byIngredient.get(row.ingredient_id)!.push(row)
  }

  const candidates: OpportunityCandidate[] = []
  for (const [ingredientId, rows] of byIngredient) {
    const sorted = [...rows].sort((a, b) => (a.invoice_date || a.recorded_at).localeCompare(b.invoice_date || b.recorded_at))
    if (sorted.length < 2) continue
    const prev = sorted[sorted.length - 2]
    const curr = sorted[sorted.length - 1]
    if (prev.price <= 0) continue
    const pctChange = ((curr.price - prev.price) / prev.price) * 100
    if (pctChange >= OPPORTUNITY_THRESHOLD_PCT) {
      const monthlyQty = monthlyQuantityByIngredient.get(ingredientId) || 0
      candidates.push({
        ingredientId,
        ingredientName: curr.ingredient_name,
        priceChangePct: Math.round(pctChange * 100) / 100,
        impactValue: Math.round((curr.price - prev.price) * monthlyQty),
      })
    }
  }
  return candidates
}

export { OPPORTUNITY_THRESHOLD_PCT }

// Orchestrates a full recompute for one supplier: metrics + opportunity
// detection + persistence, plus surfacing high-impact opportunities as
// `negotiate_supplier` AI recommendations (a type that's existed in
// ai_recommendations since Sprint 1 but was never written to). Called
// synchronously right after invoice processing writes price_history for
// that supplier — same place current_price already gets updated inline,
// no separate job/cron needed for an MVP score.
export async function recomputeSupplierIntelligence(
  supabase: any,
  restaurantId: string,
  supplierId: string
) {
  const [{ data: priceHistory }, { data: invoices }, { data: allSupplierIngredients }] = await Promise.all([
    supabase
      .from('price_history')
      .select('ingredient_id, price, recorded_at, invoices(invoice_date), ingredients(name)')
      .eq('restaurant_id', restaurantId)
      .eq('supplier_id', supplierId),
    supabase
      .from('invoices')
      .select('id, invoice_date')
      .eq('restaurant_id', restaurantId)
      .eq('supplier_id', supplierId),
    supabase
      .from('price_history')
      .select('supplier_id, ingredient_id')
      .eq('restaurant_id', restaurantId),
  ])

  const normalizedHistory = (priceHistory || []).map((r: any) => ({
    ingredient_id: r.ingredient_id,
    price: Number(r.price),
    invoice_date: r.invoices?.invoice_date || null,
    recorded_at: r.recorded_at,
    ingredient_name: r.ingredients?.name || 'Ingrediente',
  }))

  const supplierIngredientCount = new Set(normalizedHistory.map((r: any) => r.ingredient_id)).size

  const countsBySupplier = new Map<string, Set<string>>()
  for (const row of allSupplierIngredients || []) {
    if (!row.supplier_id) continue
    if (!countsBySupplier.has(row.supplier_id)) countsBySupplier.set(row.supplier_id, new Set())
    countsBySupplier.get(row.supplier_id)!.add(row.ingredient_id)
  }
  const maxIngredientCountAcrossSuppliers = Math.max(1, ...Array.from(countsBySupplier.values()).map(s => s.size))

  const metrics = calculateSupplierMetrics({
    priceHistory: normalizedHistory,
    invoices: invoices || [],
    supplierIngredientCount,
    maxIngredientCountAcrossSuppliers,
  })

  await supabase
    .from('supplier_metrics')
    .upsert(
      {
        restaurant_id: restaurantId,
        supplier_id: supplierId,
        health_score: metrics.healthScore,
        risk_level: metrics.riskLevel,
        monthly_variation_pct: metrics.monthlyVariationPct,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'supplier_id' }
    )

  // Monthly quantity estimate per ingredient, from invoice_lines in the
  // last 90 days for this supplier's invoices — used to turn a price
  // delta into a peso-per-month impact (Design Requirement: show money).
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)
  const recentInvoiceIds = (invoices || [])
    .filter((i: any) => i.invoice_date && new Date(i.invoice_date) >= ninetyDaysAgo)
    .map((i: any) => i.id)

  const monthlyQuantityByIngredient = new Map<string, number>()
  if (recentInvoiceIds.length > 0) {
    const { data: lines } = await supabase
      .from('invoice_lines')
      .select('ingredient_id, quantity, units_per_pack')
      .in('invoice_id', recentInvoiceIds)
    for (const line of lines || []) {
      const baseQty = (Number(line.quantity) || 0) * (Number(line.units_per_pack) || 1)
      monthlyQuantityByIngredient.set(
        line.ingredient_id,
        (monthlyQuantityByIngredient.get(line.ingredient_id) || 0) + baseQty / 3
      )
    }
  }

  const opportunities = detectOpportunities(normalizedHistory, monthlyQuantityByIngredient)

  for (const opp of opportunities) {
    const oppPriority = opp.priceChangePct >= 25 ? 'high' : opp.priceChangePct >= 15 ? 'medium' : 'low'
    const { data: upserted } = await supabase
      .from('supplier_opportunities')
      .upsert(
        {
          restaurant_id: restaurantId,
          supplier_id: supplierId,
          ingredient_id: opp.ingredientId,
          title: `${opp.ingredientName} aumentó ${opp.priceChangePct}%`,
          description: `Impacto económico estimado de $${Math.abs(opp.impactValue).toLocaleString('es-AR')} por mes.`,
          opportunity_type: 'price_increase',
          priority: oppPriority,
          price_change_pct: opp.priceChangePct,
          impact_value: opp.impactValue,
          status: 'open',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'supplier_id,ingredient_id,status' }
      )
      .select('id')
      .single()

    // Per spec: detect, don't advise — this only classifies the
    // opportunity and estimates impact, never proposes a purchase
    // action. Reuses the existing negotiate_supplier type rather than
    // inventing a new notification surface.
    if (upserted) {
      await supabase.from('ai_recommendations').insert({
        restaurant_id: restaurantId,
        recipe_id: null,
        type: 'negotiate_supplier',
        title: `${opp.ingredientName} aumentó ${opp.priceChangePct}% con este proveedor`,
        description: `Impacto económico estimado de $${Math.abs(opp.impactValue).toLocaleString('es-AR')} por mes. Revisar en Proveedores › Oportunidades.`,
        estimated_impact_pp: null,
        priority: opp.priceChangePct >= 25 ? 'high' : 'medium',
        status: 'pending',
      })
    }
  }

  return metrics
}
