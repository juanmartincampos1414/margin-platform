# Sprint 06 — Supplier Intelligence: Technical Blueprint

Grounded in the actual current production schema and code (Sprint 1 through UX_01), not the spec's literal table names where they'd duplicate something that already exists. No implementation in this document — planning only.

---

## 1. Product Objective

Turn invoice data Margin already has into decision support for supplier conversations — which suppliers are reliable, which products just got more expensive, and which of those increases actually matter to the business. This is explicitly **not** procurement: no purchase orders, no negotiation engine, no supplier contact. It's the same posture as Menu Intelligence — Margin surfaces the number, the human acts on it.

## 2. User Stories (from spec, unchanged)

- US-026 — Entender cómo evolucionan los precios de mis proveedores.
- US-027 — Detectar aumentos rápidamente.
- US-028 — Identificar proveedores más estables.
- US-029 — Entender qué proveedores impactan más en mi margen.
- US-030 (system) — Calcular indicadores económicos automáticamente.

## 3. Database Changes

**Key architecture decision: do not create `supplier_price_history`.** The spec's literal schema proposes a new table (`supplier_id, product_id, price, invoice_date`) — but `price_history` (created in Sprint 1) already holds exactly this: `restaurant_id, ingredient_id, supplier_id, invoice_id, price, unit, recorded_at`, with `invoice_date` one join away via `invoices`. Creating a second table would duplicate a write path Margin already has, and risk the same kind of silent-drift bug fixed in UX_01 (two formulas/two data paths that can disagree). Supplier price evolution is a **query** over the existing table, not a new one. ("`product_id`" in the spec maps to `ingredient_id` in our schema — there is no separate products table; ingredients serves that role throughout the app.)

**New tables actually needed:**

- **`supplier_metrics`** (`id, restaurant_id, supplier_id, health_score numeric, risk_level text, monthly_variation_pct numeric, computed_at timestamptz`) — a *cached* result, not computed live on every page load like recipe cost. Health Score requires scanning a supplier's full invoice/price history (potentially hundreds of rows); unlike recipe cost (a handful of ingredient rows), this is expensive enough to justify caching with an explicit recompute step (triggered on each new invoice processed for that supplier, same place `price_history` already gets written).
- **`supplier_opportunities`** (`id, restaurant_id, supplier_id, ingredient_id, title, description, price_change_pct, impact_value, status, created_at`) — genuinely new, stateful data (an `open → reviewed/dismissed` lifecycle that must persist), not a derived value like the metrics above.

No changes to `suppliers`, `price_history`, `invoices`, or `invoice_lines` — this sprint reads from them, never alters their shape.

## 4. API Changes

All new, additive routes — nothing in Invoice Intelligence or Product Intelligence touched, consistent with the spec's explicit boundary and Margin's Hard Rules:

- `GET /api/suppliers` — already exists; extend the response to include `health_score`, `risk_level`, `monthly_variation_pct` from `supplier_metrics` (left join, null until first computed).
- `GET /api/suppliers/:id` — new. Supplier Profile: general info + the four KPIs (FR-035).
- `GET /api/suppliers/:id/history` — new. Price evolution per ingredient, queried from `price_history` joined to `invoices` for date, filterable by ingredient/date range.
- `GET /api/suppliers/:id/opportunities` — new. Reads `supplier_opportunities` for that supplier.
- `GET /api/suppliers/ranking` — new. Most Stable / Most Volatile / Highest Impact / Most Used, derived from `supplier_metrics` + aggregate spend.
- `GET /api/suppliers/top-increases` — new. Cross-supplier, ranked by `price_change_pct` from `supplier_opportunities`.
- All routes use `requireRestaurant()` — no exceptions, per the standing Hard Rule 0 from Priority 01.

## 5. UI Screens

Per spec, Screens 28–34. Two integration notes against current architecture:

- **Screen 28 is an evolution of the existing `/proveedores` page**, not a new route — that page already exists and already computes `total_spend`/`invoice_count`/`ingredient_count` per supplier; this sprint adds Health Score, Risk Level, and Monthly Variation columns to it.
- **Screen 29 (Supplier Profile)** becomes the existing `/proveedores/[id]` page's evolution, same pattern.
- Screens 30–34 (Price Evolution, Opportunities, Ranking, Top Increases, Critical Products) are new routes under `/proveedores/...`.

## 6. KPIs

Per spec's Supplier Profile (FR-035) and Screen 29: Supplier Health Score, Products, Invoices, Monthly Variation, Risk Level. All four are computable today from `suppliers`, `invoices`, `invoice_lines`, and `price_history` — no new data collection needed, satisfying the spec's own constraint that "all insights must be generated exclusively from invoice data already processed by Margin."

## 7. Supplier Health Score Formula (0–100, MVP weights per spec)

All four components computed entirely from existing tables:

- **Price Stability (40%)** — `100 - normalized_volatility`, where volatility is the standard deviation of month-over-month % price changes across this supplier's `price_history` rows. A supplier with flat prices scores near 100; one with wide swings scores low.
- **Invoice Frequency (30%)** — based on average days between this supplier's invoices over the last 90 days, scored against a regularity target (e.g. ≤30 days between invoices → 100, scaling down as the gap widens).
- **Product Coverage (20%)** — `(distinct ingredients sourced from this supplier) / (distinct ingredients sourced from the restaurant's single largest supplier)`, capped at 100 — measures how central this supplier is to the restaurant's overall sourcing, not an absolute count that means nothing on its own.
- **Historical Consistency (10%)** — `% of months since this supplier's first invoice that had at least one invoice` — catches a supplier the restaurant only orders from sporadically, distinct from price volatility.

Per the spec's own note, **the formula itself should be configurable later** (weights as restaurant-level settings) — this sprint hardcodes the MVP weights above, doesn't build a settings UI for them.

## 8. Supplier Comparison Logic (Ranking, FR-041)

Four categories, each a different sort over `supplier_metrics` + aggregate spend, computed at the same time the score is cached:

- **Most Stable** — highest Price Stability component.
- **Most Volatile** — lowest Price Stability component (the same number, opposite end).
- **Highest Impact** — highest total spend (`Σ invoice.total_amount` for that supplier) — economic weight, not just price movement.
- **Most Used** — highest invoice count / most distinct ingredients sourced.

## 9. Impact on Menu Intelligence

**None required as a new write path — and that's the point.** Menu Intelligence's profitability metrics (built in Sprint 05.5) already read `ingredients.current_price` live, every page load. When a supplier's price increase updates an ingredient's `current_price` (already happening today, via the existing invoice-processing flow), any dish using that ingredient already shows the new cost and margin in Menu Intelligence automatically — Supplier Intelligence doesn't need to push anything there. What Supplier Intelligence *adds* is the explanation layer: **why** a dish's margin moved, traced back to a specific supplier and price change, which Menu Intelligence alone can't show.

This is also where **Critical Product Detection (FR-043)** should plug into the Sprint 05.5 bridge directly: "Presencia en Recetas" should mean *presence in a recipe that's linked to an active menu item* (`menu_items.recipe_id is not null and status = 'active'`), not just "used in any recipe somewhere" — an ingredient sitting in an orphaned, unused recipe shouldn't be flagged as economically critical.

## 10. Impact on Profitability Calculations

None — `lib/recipes.ts`'s `calculateRecipeCost`/`calculateProfitability` (the single source of truth established in Sprint 05.5) is not touched by this sprint. Supplier Intelligence is a read-only consumer of the same `ingredients.current_price` that formula already uses; it never recalculates margin itself.

## 11. AI Recommendation Opportunities

The spec is explicit: detect, don't advise — "No generar recomendaciones de compra. No generar órdenes. No contactar proveedores." So the AI's role here is classification and impact estimation (is this increase relevant? how much does it cost in pesos?), not generated advisory text.

One natural connection worth flagging: `ai_recommendations.type` already includes `'negotiate_supplier'` in its check constraint (added back in Sprint 1, never used until now). When a high-impact opportunity is detected, writing a row of that type into the **same `ai_recommendations` table UX_01 just fixed** — rather than inventing a separate notification surface — means it shows up for free in the Dashboard's now-real "Recomendaciones pendientes" KPI and panel. No new schema, no new UI surface, just using a column that's been sitting unused since the very first migration.

## 12. Future Connection with Procurement

Explicitly out of scope for this sprint (per spec: no Procurement, Purchase Orders, Supplier Marketplace, Negotiation Engine, Supplier Messaging, Automated Buying) — but `supplier_opportunities` is deliberately shaped so a future Procurement module can build on it without rework: each row already ties a specific `supplier_id` + `ingredient_id` + estimated peso `impact_value` together with a `status` lifecycle (`open/reviewed/dismissed`). A later Procurement sprint could add a `converted_to_po` status or similar without touching this sprint's schema. Nothing here should attempt to anticipate that further than keeping the shape clean.

---

## Open Questions Before Implementation

1. **Opportunity threshold**: what % price increase qualifies as "relevant" for FR-040/FR-042 (the spec's own examples use 28%/34%, but doesn't state a minimum)? Recommend a configurable-later default of **15%** month-over-month, consistent with how Priority 05's pack-detection threshold was chosen — a number we can tune after seeing real data, not before.
2. **Recompute trigger for `supplier_metrics`**: recompute synchronously every time a new invoice is processed for that supplier (simplest, consistent with how `current_price` already updates inline in `/api/invoices/process`), or on a separate cadence? Recommend synchronous, same place, same pattern — no new job/cron infrastructure needed for an MVP score.
3. **"Most Used" tie-breaking**: invoice count or distinct-ingredient count when they disagree? Needs one explicit rule before the ranking ships, not left ambiguous in code.

Let me know if you want me to proceed with implementation following this blueprint, or address the open questions first.
