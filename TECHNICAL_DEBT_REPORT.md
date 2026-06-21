# Margin — Technical Debt Report

Severity scale: 🔴 High (fix before/alongside next sprint) · 🟡 Medium (fix opportunistically) · ⚪ Low (cosmetic/style)

## Security & Permissions

🔴 **Unauthenticated API routes trust client-supplied IDs.** `/api/invoices/upload`, `/api/invoices/process`, and `/api/ai/recommendations` have no session check and use the Supabase **service role** key, which bypasses RLS. They trust `restaurantId` / `invoiceId` from the request body. Today, anyone who discovers these URLs could upload/process invoices into, or generate AI text against, *any* restaurant ID. This worked fine for direct `curl` testing during the Sprint 1 verification, but it's a real multi-tenant leak in production. **Fix:** require a session, derive `restaurant_id` from `profiles` server-side (like `/api/suppliers` already does), and verify any `invoiceId` passed in belongs to that restaurant before acting on it.

🔴 **No DELETE endpoint exists; the one delete in the app is a raw client-side hard delete.** `IngredientsClient.tsx` calls `supabase.from('ingredients').delete()` directly from the browser. This (a) bypasses any server-side validation, (b) is a hard delete with no archive/soft-delete step, directly violating the Historical Integrity principle in `[[AGENTS.md]]`, and (c) will throw an unhandled Postgres FK-restrict error if the ingredient is used in any `recipe_ingredients` row (no error handling around the call). This is exactly `Maintenance_01_Ingredient_Delete`, the current top priority.

🟡 **`/proveedores` is not in the middleware's protected-route matcher.** It's still safe (the page itself checks `auth.getUser()` and redirects), but it's an inconsistency that will bite the next person who assumes the middleware list is exhaustive. Add it to `src/middleware.ts`.

⚪ **Auth-check logic is duplicated** in `middleware.ts` and again at the top of nearly every page component (`redirect('/login')` if no user). Functionally harmless (defense in depth), but it's copy-pasted ~9 times. Could be a small helper, low priority.

## Data Integrity

🔴 **`price_history` is append-only by *convention*, not by database constraint.** No trigger currently blocks an `UPDATE` or `DELETE` against `price_history`. Nothing in the app does this today, but there's also nothing stopping a future bug (or a careless migration) from doing it. Given Historical Integrity is an explicit, named product principle, this is worth a `BEFORE UPDATE OR DELETE` trigger that raises an exception, now, before Sprint 05/06 add more write paths.

🟡 **`ingredients.current_price` is a single mutable snapshot column, separate from `price_history`.** Every recipe-cost calculation in the app reads `current_price` directly. This is fine functionally, but means there is no DB-level guarantee that `current_price` always matches the latest `price_history` row for that ingredient — they're updated in two separate statements inside `/api/invoices/process` (not in the same transaction), so a failure between the two `insert`/`update` calls would leave them inconsistent.

🟡 **`get_recipe_cost()` SQL function exists but is dead code.** Every page (`recetas`, `recetas/[id]`, `analisis`) reimplements the same cost calculation in JavaScript (`calcCost`/`calcLineCost`, duplicated 3+ times with identical kg/gr and lt/ml unit-conversion logic). This is a "wrote it twice, in two languages" situation — the SQL function was clearly intended to be the source of truth and never got wired up. Low risk today (the JS copies are consistent with each other), but it's exactly the kind of duplication that drifts silently — if someone fixes a unit-conversion edge case in one of the three JS copies and not the others, costs will disagree across pages.

⚪ **`ai_recommendations` table is never written to.** The Dashboard queries it (always empty), and the actual AI Copilot (`/api/ai/recommendations`) returns recommendations directly to the client without persisting them. This means recommendations aren't visible anywhere outside the single recipe page that generated them, and "Recomendaciones pendientes" on the Dashboard will permanently show 0. Not a bug, but a half-wired feature.

⚪ **`sales_log` table has zero writers anywhere in the app.** Schema-only, for now. Fine as long as Sprint 05/06 work doesn't assume it has data.

## Architecture / Consistency

🟡 **`/dashboard` lives outside the `(app)` route group** and duplicates the auth + profile-fetch + Sidebar-render logic that `(app)/layout.tsx` already centralizes for every other page. Functionally identical today, but it means any future change to the authenticated shell (e.g. adding a top bar, changing how `restaurantName` is fetched) has to be applied in two places. Moving `dashboard/page.tsx` into `(app)/dashboard/page.tsx` would remove the duplication; low urgency since it's not broken.

🟡 **`categories` table is fully unused.** `ingredients.category_id` and `recipes.category_id` both reference it, but no page creates, lists, or assigns categories. Any UI work that needs "filter by category" (plausible for Menu Intelligence, Sprint 05) will need to build this from scratch — it's not blocked, just not started.

⚪ **No automated tests anywhere in the repo.** Every verification done for Sprint 1 was manual (browser + direct `curl` against the deployed API). Not unusual for a project at this stage, but worth naming explicitly since Sprint 05/06 will add more state-mutating logic (menu parsing, supplier health scoring) where regressions are easy to introduce silently.

## Performance / Scalability

⚪ **Supplier spend/invoice-count/price-variation are computed in JS on every page load**, not cached or computed in SQL (`/api/suppliers`, `/api/suppliers/[id]`, `proveedores/page.tsx` all fetch the full `invoices`/`price_history` rows for a supplier and reduce them in Node). Fine at current data volumes (a handful of test rows); will need to move to SQL aggregates or a materialized view once a real restaurant has hundreds of invoices and ingredients.

⚪ **OCR processing is synchronous inside the request/response cycle** (`/api/invoices/process` calls Claude and waits, blocking the HTTP response). Acceptable for MVP UX (the upload UI already shows a spinner), but will need to move to a background job/queue if invoice volume or file size grows enough to risk serverless function timeouts.

## Summary Priority Order

1. 🔴 Lock down `/api/invoices/upload`, `/api/invoices/process`, `/api/ai/recommendations` with session-based tenant scoping
2. 🔴 Build `Maintenance_01_Ingredient_Delete` properly: soft-delete/archive via API, not a raw client-side hard delete
3. 🔴 Add a DB trigger that rejects UPDATE/DELETE on `price_history`
4. 🟡 Everything else above, opportunistically, ideally before Sprint 06 (Supplier Intelligence) adds more read/write surface on top of `suppliers`/`price_history`
