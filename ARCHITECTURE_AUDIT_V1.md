# Margin — Architecture Audit V1

Read-only documentation pass over the current codebase, produced before implementation work on Sprint 05 (Menu Intelligence) and Sprint 06 (Supplier Intelligence). No code was modified to produce this report.

Companion documents: [`DATABASE_MAP.md`](DATABASE_MAP.md) · [`ROUTES_MAP.md`](ROUTES_MAP.md) · [`TECHNICAL_DEBT_REPORT.md`](TECHNICAL_DEBT_REPORT.md) · [`ENTITY_RELATIONSHIPS.md`](ENTITY_RELATIONSHIPS.md)

---

## 1. Executive Summary

**What's been built:** A working, deployed (Vercel, `www.margin.business`), multi-tenant Next.js + Supabase application covering invoice OCR, supplier/ingredient auto-creation, append-only price history, recipe costing, margin analysis, and an on-demand AI recommendation panel. Sprint 1 (Invoice Intelligence + Supplier Intelligence) was built, deployed, and verified end-to-end in production with a real OCR round-trip (synthetic test invoice → supplier created → 3 ingredients created → 3 price_history rows → correct RLS isolation between two test accounts).

**Maturity level:** Functional MVP / early production. The core data spine (`invoice → supplier → ingredient → price_history → recipe → margin`) works and is live, but several features are partially wired (AI recommendations aren't persisted, `categories` is unused, no delete/archive flow exists yet) and there is no automated testing or background job infrastructure.

**Modules working end-to-end:**
- Invoice Intelligence (upload → OCR → supplier/ingredient creation → price history)
- Supplier Intelligence (list, detail dashboard, price evolution chart, purchase history)
- Recipe Engine / Food Cost (create recipe, attach ingredients, compute cost/margin live)
- Margin Intelligence (ranking page, color-coded thresholds)

**Modules partially implemented:**
- Ingredient Master (normalization fields exist and populate correctly; no merge/validate workflow yet — that's explicitly Sprint 2 scope, and the raw hard-delete is a known gap)
- AI Copilot (generates real recommendations via Claude, but doesn't persist them — the Dashboard's "pending recommendations" count will always read 0)
- Dashboard (shows real KPIs, but recipe-cost logic is duplicated in JS rather than using the existing `get_recipe_cost()` SQL function)

**General assessment:** The foundation is solid for what it covers — RLS-based multi-tenancy is correctly implemented and was verified live, the append-only price history pattern is followed correctly in the one place it matters, and the codebase is small enough (~30 source files) to be fully read in one pass. The main risks are *security* (three API routes have no auth check) and *historical-integrity enforcement* (the append-only rule is convention, not a DB constraint) — both flagged in detail in the Technical Debt Report, and both worth closing before Sprint 05/06 add more surface area.

---

## 2. Frontend Architecture

- **Framework:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4.
- **Routing structure:** File-based App Router. Authenticated pages live under the `(app)` route group (which provides a shared `Sidebar` + auth guard via `(app)/layout.tsx`), *except* `/dashboard`, which sits outside that group and duplicates the same logic inline (see Technical Debt Report).
- **Pages:** see [`ROUTES_MAP.md`](ROUTES_MAP.md) for the full table — 6 authenticated app pages (recetas, ingredientes, facturas, proveedores, análisis, dashboard), 2 admin pages, 2 public auth pages, 1 landing page.
- **Layouts:** `app/layout.tsx` (root HTML shell, no nav) → `(app)/layout.tsx` (fetches user + profile, renders `Sidebar`, redirects if unauthenticated). Admin pages render their own dark-themed nav inline rather than using a shared admin layout.
- **Components:**
  - `components/layout/Sidebar.tsx` — client component, nav list + logout
  - `components/dashboard/DashboardContent.tsx` — presentational, receives server-fetched data as props
  - `components/recipes/RecipeForm.tsx` — client component, recipe create/edit with live cost calc
  - `components/recipes/RecipeAI.tsx` — client component, calls `/api/ai/recommendations` on demand
  - Several pages have a colocated client component for interactivity (`IngredientsClient.tsx`, `UploadInvoice.tsx`, `PriceEvolutionChart.tsx` for the supplier detail recharts graph)
- **State management:** No global state library. Server Components fetch data directly via Supabase; client components hold local `useState` and call either the Supabase browser client directly (`recetas`, `ingredientes`) or a Next.js API route (`facturas`, `ingredientes` PATCH, `recipes/RecipeAI`) — **the split between "talk to Supabase directly from the client" vs. "go through an API route" is inconsistent across features**, not a deliberate pattern.
- **Authentication flow:** Supabase Auth (email/password). `middleware.ts` redirects unauthenticated users away from protected path prefixes; pages independently re-check `auth.getUser()` and redirect again (belt-and-suspenders, slightly duplicated). Sign-up (`/registro`) creates the `auth.users` row client-side via `supabase.auth.signUp`, then calls `/api/auth/setup` (service-role) to create the `restaurants` row and backfill `profiles.restaurant_id` — this two-step dance exists because the trigger-created profile has no restaurant yet at signup time.

### Folder structure (frontend-relevant)

```
src/
  app/
    page.tsx                          # landing
    login/page.tsx
    registro/page.tsx
    dashboard/page.tsx                # outside (app) group — duplicated shell
    (app)/
      layout.tsx                      # shared Sidebar + auth guard
      recetas/{page,nueva,[id],[id]/editar}/page.tsx
      ingredientes/{page.tsx, IngredientsClient.tsx}
      facturas/{page,[id]}/page.tsx, subir/{page.tsx, UploadInvoice.tsx}
      proveedores/{page.tsx, [id]/{page.tsx, PriceEvolutionChart.tsx}}
      analisis/page.tsx
    admin/{page.tsx, restaurantes/[id]/{page.tsx, AdminRestaurantActions.tsx}}
  components/
    layout/Sidebar.tsx
    dashboard/DashboardContent.tsx
    recipes/{RecipeForm.tsx, RecipeAI.tsx}
  lib/
    supabase/{client.ts, server.ts}    # browser + server (+ admin) Supabase factories
    utils.ts                          # cn(), formatCurrency, formatPercent, margin color helpers
```

---

## 3. Backend Architecture

There is no separate backend service — "backend" here means Next.js Route Handlers (`src/app/api/**/route.ts`) plus Supabase (Postgres + Auth + Storage) as the actual application backend.

- **Framework:** Next.js Route Handlers, no separate Express/Nest/etc.
- **Services / business logic layers:** None abstracted out — each route handler inlines its own Supabase queries and (where relevant) Claude API calls. There is no service/repository layer; logic that's shared (e.g. recipe cost calculation) is duplicated per-caller rather than factored into a shared module.
- **Controllers / API structure:** REST-ish, one `route.ts` per resource, see [`ROUTES_MAP.md`](ROUTES_MAP.md) for the full table. Two clients are used depending on the route: the session-aware server client (`@/lib/supabase/server` → `createClient()`, respects RLS) for `/api/suppliers*` and `/api/ingredients*`; the raw service-role client (`@supabase/supabase-js` directly, bypassing RLS) for `/api/invoices/*`, `/api/auth/setup`, `/api/admin/*`.
- **Authentication:** Session cookie-based, via `@supabase/ssr`. `createClient()` (server) reads cookies via `next/headers`; `createAdminClient()` and the raw `createClient` from `@supabase/supabase-js` use the service-role key and ignore the session entirely.
- **Middleware:** `src/middleware.ts` — single Next.js middleware, refreshes the Supabase session cookie and redirects based on path prefix (see Routes Map for the exact rules and the gap in the matcher list).
- **External services:** Anthropic SDK (`@anthropic-ai/sdk`) called directly from two route handlers (`/api/invoices/process` for OCR, `/api/ai/recommendations` for recipe analysis) — no abstraction layer, prompts are inlined as template strings in each route.

### Folder structure (backend-relevant)

```
src/app/api/
  auth/setup/route.ts
  admin/restaurants/[id]/route.ts
  invoices/{upload,process}/route.ts
  suppliers/{route.ts, [id]/route.ts}
  ingredients/{route.ts, [id]/route.ts}
  ai/recommendations/route.ts
src/lib/supabase/server.ts            # createClient() + createAdminClient()
supabase/
  schema.sql                          # fresh-install reference (kept in sync manually)
  migrations/0002_invoice_supplier_intelligence.sql   # the only migration file that exists
```

**Note:** there is exactly one migration file in the repo. `schema.sql` is treated as a hand-maintained "current state" reference rather than the migrations being the source of truth — anyone applying schema changes needs to update both, and nothing enforces that they stay in sync (this was done manually and correctly for Sprint 1, but it's a process risk for Sprint 05/06).

---

## 5. Existing Product Modules

### Invoice Intelligence
**Works:** Upload (PDF/JPG/PNG) → Claude OCR extraction (supplier name/tax_id, invoice number/dates, line items with qty/unit/price) → automatic supplier match-or-create (by tax_id, then fuzzy name) → automatic ingredient match-or-create (by `normalized_name`) → `ingredient_aliases` audit trail → append-only `price_history` (only on actual price change) → invoice status finalization (`processed` vs `review_required` based on a 70% confidence threshold). Verified live in production.
**Missing:** No UI affordance for a human to act on `review_required` beyond a static banner pointing to Ingredient Master; no retry/re-process action if OCR fails; no way to manually correct a misdetected supplier or split/merge a misread line item from the invoice detail page itself.
**Limitations:** The two routes that drive this (`upload`, `process`) have no auth check (🔴 in Technical Debt Report) — currently callable by anyone with the URL and a restaurant ID.

### Products (Ingredient Master)
**Works:** List, manual create/edit (price, unit, brand, stock level), automatic creation from OCR with normalization (`normalized_name`) and lifecycle `status` (`draft` on auto-create, `validated` on manual edit).
**Missing:** No merge UI (the `merged_into_id` column and `ingredient_aliases` data exist but nothing reads them to power a "these look like duplicates" suggestion), no archive workflow, and the one delete path is a raw hard delete from the client — directly the subject of `Maintenance_01_Ingredient_Delete`.

### Suppliers
**Works:** Auto-creation from invoices, list with computed spend/invoice-count/ingredient-count/last-purchase, detail dashboard with average price variation and a price evolution chart (recharts), manual create/edit via API.
**Missing:** No supplier health score, no "critical products" or "opportunity detection" (both explicitly Sprint 06 scope), no archive/deactivate action exposed in the UI (the `status` field and PATCH support it; no button calls it).

### Recipes
**Works:** Create/edit with live ingredient search + quantity/unit entry, cost computed client-side in real time (unit-conversion-aware for kg↔gr and lt↔ml), gross margin shown with color thresholds (≥60% green, 40-59% yellow, <40% red).
**Missing:** No category assignment UI (despite the column existing), no recipe archiving distinct from `status='inactive'`, no bulk recipe import.

### Food Cost
**Works:** Computed consistently (same formula) across Recetas list, Recipe detail, and Análisis — `sum(quantity × ingredient.current_price / unit_ratio)`.
**Missing:** The formula is copy-pasted in three places instead of using the existing `get_recipe_cost()` SQL function (🟡 in Technical Debt Report) — not broken today, but a drift risk.

### Dashboard
**Works:** Real KPI cards (active recipes, ingredient count, recent invoices, pending recommendations), quick actions, recent recipes list — all server-fetched per-restaurant.
**Missing:** "Recomendaciones pendientes" will always show 0 because nothing writes to `ai_recommendations` (see AI Copilot below). Lives outside the `(app)` route group, duplicating shell logic.

### AI Copilot
**Works:** On-demand, per-recipe analysis via Claude (`claude-haiku-4-5`), returns 1-4 structured recommendations (type/title/description/estimated impact/priority) rendered in a panel on the Recipe detail page.
**Missing:** Recommendations are never persisted to `ai_recommendations` — they exist only in that page's local React state and vanish on refresh. No platform-wide query interface ("ask the platform a question") — current README's vision for AI Copilot ("allow users to query platform data") is broader than what's built, which is scoped to single-recipe analysis only.

---

## 8. Readiness Assessment — Sprint 05: Menu Intelligence

**Objective (from README):** Parse uploaded menu files (PDF/JPG/PNG/XLSX/CSV) into categories, menu items, and selling prices — explicitly **not** auto-generating recipes.

**Reusable components:**
- The upload/process two-step pattern from Invoice Intelligence (`/api/invoices/upload` + `/api/invoices/process`) is a directly reusable shape: store file → async-extract → review-required gate on low confidence. Menu Intelligence should follow the same shape (`/api/menus/upload` + `/api/menus/process`).
- `UploadInvoice.tsx`'s drag-and-drop + preview UI is reusable almost as-is for a menu upload page.
- The Claude OCR/extraction call pattern (image/PDF → base64 → structured JSON prompt) is directly reusable; XLSX/CSV will need a different (non-vision) parsing path since those are structured text, not images — likely a plain text-extraction + Claude-structuring step, or even skip Claude entirely for CSV given it's already structured.

**Reusable APIs:** None of the existing API routes are directly reusable for menu *data* (they're invoice/supplier/ingredient specific), but the **auth/tenant-scoping pattern** in `/api/suppliers/route.ts` (session → profile → restaurant_id → scoped query) is the template every new Sprint 05 route should follow — notably stricter than the pattern used in `/api/invoices/*`.

**Reusable database structures:** `categories` table already exists and is currently unused — this is very likely where Menu Intelligence's "Categories" output should land, finally giving that table a purpose. `recipes.category_id` already points at it, so menu categories and recipe categories would share the same table for free.

**New tables required:**
- A `menu_items` table: `id, restaurant_id, category_id (fk → categories), name, description, selling_price, recipe_id (nullable fk → recipes), status, source (manual|extracted), created_at`. The nullable `recipe_id` is the key design point — it must be possible for a menu item to exist with no recipe attached yet (per the "do not auto-generate recipes" rule), and get connected to a recipe later as a separate, deliberate action.
- Possibly a `menu_uploads` table mirroring `invoices` (file, status, confidence, extracted_data) if menu parsing needs the same review-required workflow invoices have — likely yes, for consistency and for the same reasons (OCR confidence varies).

**Files that would need modification:** `src/middleware.ts` (add new protected route prefix), `Sidebar.tsx` (add nav item), `supabase/schema.sql` + a new migration file. No existing Sprint 1 files should need to change — this should be purely additive, in line with Rule 02/03 in `[[AGENTS.md]]` (don't touch Invoice/Product Intelligence unless necessary).

**Risks:**
- XLSX/CSV parsing is a genuinely different code path from the image/PDF-via-Claude-vision pattern used everywhere else in this codebase — there's no existing precedent for it here, so this is new technical ground, not just "more of the same."
- "Do not generate recipes automatically" is a constraint that has to be enforced in the data model (nullable `recipe_id`) AND in the UI (no auto-link button that's one click away from violating it) — worth being explicit about during implementation review.

**Dependencies:** `categories` table reuse is the main one; otherwise self-contained.

---

## 9. Readiness Assessment — Sprint 06: Supplier Intelligence

**Objective (from README):** Turn supplier data into economic intelligence — health score, price evolution, monthly variation, critical products, opportunity detection. Explicitly **not** procurement/purchase orders.

**Reusable components:** `proveedores/[id]/page.tsx` already computes average price variation and renders a price evolution chart (recharts) — this is most of the visual foundation Sprint 06 needs; it likely extends this same page rather than building a new one. `PriceEvolutionChart.tsx` is directly reusable.

**Reusable APIs:** `/api/suppliers/[id]` already returns `price_history` and computes `avg_price_variation` server-side — the aggregation pattern is right there to extend (e.g. add `health_score`, `critical_products` to the same response shape) rather than building a parallel endpoint.

**Reusable database structures:** `price_history` + `suppliers` + `ingredients` + `invoice_lines` already carry everything Sprint 06's metrics need to be *computed* (no new raw data required) — Monthly Variation and Price Evolution are just different aggregations of `price_history`; Critical Products is likely "ingredients from this supplier with high recipe usage and/or high recent variation," computable by joining `recipe_ingredients` against `ingredients.supplier_id`.

**New tables required:** Likely none for the underlying data — but if health-score computation is expensive (multi-table aggregation across invoices/price_history/recipe_ingredients) and needs to be fast on the suppliers list page, a cached `supplier_health_snapshots` table (recomputed periodically or on invoice processing) may be warranted rather than computing it live on every page load. This is a performance decision, not a data-availability one.

**Risks:**
- "Health Score" needs a defined formula before implementation — the README names the output, not the calculation. This is exactly the kind of ambiguity Rule 05 in `[[AGENTS.md]]` says to stop and ask about rather than assume.
- "Opportunity Detection" risks scope-creep into Procurement (explicitly out of scope per the README: "do not generate purchase orders") — worth being explicit that "opportunity" here means a flagged insight, not an actionable purchasing flow.

**Dependencies:** None blocking — this sprint is the more self-contained of the two, since it's almost entirely a read-side feature on data that already exists and is already flowing correctly (verified live in Sprint 1).

---

## 10. Build Recommendations

**Quick wins** (small, low-risk, immediately valuable):
- Wire `/api/ai/recommendations` to actually `insert` into `ai_recommendations` so the Dashboard's pending-recommendations count becomes real.
- Add `/proveedores` to the middleware's protected-route matcher.
- Replace the 3 duplicated JS cost-calculation functions with calls to the existing `get_recipe_cost()` SQL function (or a single shared TS helper, if staying client-side is preferred for live-editing UX).

**Low-risk improvements:**
- Move `dashboard/page.tsx` into the `(app)` route group to remove the duplicated shell logic.
- Add a `BEFORE UPDATE OR DELETE` trigger on `price_history` to make the append-only rule a hard DB guarantee instead of a convention.

**High-impact improvements (do before/alongside Sprint 05-06):**
- Add session-based auth + tenant scoping to `/api/invoices/upload`, `/api/invoices/process`, `/api/ai/recommendations` (🔴 highest-priority item in the Technical Debt Report — this is a live multi-tenant security gap).
- Build `Maintenance_01_Ingredient_Delete` as a proper soft-delete/archive API endpoint, replacing the client-side hard delete — this is already the team's stated #1 priority, and the audit confirms it's a real gap, not just process hygiene.

**Potential refactors (not urgent, worth tracking):**
- Consolidate the "talk to Supabase directly from client" vs. "go through an API route" inconsistency into one convention — probably: server-mutations go through API routes for anything that needs validation/auth beyond RLS, simple CRUD can stay direct. Worth deciding explicitly rather than letting it stay accidental.
- Decide whether `supabase/schema.sql` or the `migrations/` folder is the actual source of truth going forward, and stop hand-maintaining both.

---

## 12. Final Assessment

**1. What is the current maturity level of Margin?**
Functional MVP, live in production, with one fully-built and verified module pair (Invoice + Supplier Intelligence) and two partially-built ones (Recipe/Margin Intelligence works but has duplicated logic; AI Copilot works but doesn't persist). No automated tests, no background job infrastructure, single-region/single-instance Supabase — appropriate for current scale (a handful of test restaurants), not yet hardened for many concurrent tenants with high invoice volume.

**2. Is the architecture ready for Sprint 05 (Menu Intelligence)?**
Yes, with one new table (`menu_items`, nullable `recipe_id`) and reuse of the existing `categories` table and the upload/process route pattern. The main new technical ground is XLSX/CSV parsing, which has no precedent in this codebase yet. No existing module needs to change.

**3. Is the architecture ready for Sprint 06 (Supplier Intelligence)?**
Yes, more so than Sprint 05 — all underlying data (`suppliers`, `price_history`, `invoice_lines`, `recipe_ingredients`) already exists and is flowing correctly in production. This is primarily a read-side aggregation/scoring feature. The only open question is the Health Score formula, which needs a decision before implementation, not more architecture.

**4. What are the biggest technical risks?**
(1) Three API routes with no auth check, currently exploitable cross-tenant in production. (2) `price_history`'s append-only guarantee is enforced by discipline, not by the database — one careless future write breaks a named product principle silently. (3) Cost-calculation logic duplicated three times in JS with no single source of truth, despite a SQL function existing for exactly this purpose.

**5. What would you improve before continuing development?**
Close the three security gaps and add the `price_history` protection trigger first — both are small, fast fixes relative to their blast radius. Then proceed with `Maintenance_01_Ingredient_Delete` as already prioritized, followed by Sprint 05 and Sprint 06 in the stated order. Nothing found in this audit suggests the build order in the README needs to change.
