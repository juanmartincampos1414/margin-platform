# Margin — Database Map

Source of truth: [`supabase/schema.sql`](supabase/schema.sql). All tables are in the `public` schema, on Postgres (Supabase). Multi-tenant via `restaurant_id` on every business table, enforced by RLS through `public.get_my_restaurant_id()`.

---

## restaurants

Tenant root. One row per restaurant/customer account.

- `id` (uuid, pk)
- `name`, `owner_email` (unique), `logo_url`
- `plan` (`trial|basic|pro|enterprise`), `active` (bool)
- `settings` (jsonb)
- `created_at`, `updated_at` (auto-touched by trigger)

**Relationships:** parent of every tenant-scoped table below (1—N).

---

## profiles

Auth user ↔ restaurant ↔ role link. `id` is the same UUID as `auth.users.id` (Supabase Auth).

- `id` (uuid, pk, fk → `auth.users`)
- `restaurant_id` (fk → restaurants, nullable until onboarding completes)
- `full_name`, `avatar_url`
- `role` (`owner|manager|staff|admin`)

**Relationships:** N profiles → 1 restaurant. Auto-created by `handle_new_user()` trigger on `auth.users` insert (restaurant_id is null at first; `/api/auth/setup` fills it in).

---

## categories

Lightweight tagging table, shared by `ingredients` and `recipes`.

- `id`, `restaurant_id`, `name`, `color`

**Relationships:** 1 category → N ingredients, 1 category → N recipes. **Currently unused in any UI** — no page creates/lists categories, but `ingredients.category_id` and `recipes.category_id` both reference it.

---

## suppliers

Introduced in Sprint 1.

- `id`, `restaurant_id`
- `name`, `tax_id` (unique per restaurant), `phone`, `email`
- `payment_terms`, `credit_days`
- `status` (`active|inactive|archived`)
- `created_at`, `updated_at`

**Relationships:** 1 supplier → N invoices, 1 supplier → N ingredients (current supplier), 1 supplier → N price_history rows.

---

## ingredients

The Product Master. Sprint 1 added normalization/lifecycle fields on top of the original ingredient table.

- `id`, `restaurant_id`
- `name`, `normalized_name`, `brand`
- `unit` (`kg|gr|lt|ml|un|doc`)
- `current_price` (numeric — **the current snapshot, not historical**)
- `stock_level` (`high|medium|low|out` — manual, no automation behind it)
- `category_id` (fk, optional, unused in UI)
- `supplier_id` (fk → suppliers, "current/primary supplier")
- `status` (`draft|validated|merged|archived`)
- `merged_into_id` (self-fk, for Sprint 2 merge workflow — column exists, no UI/API uses it yet)
- `last_updated`, `created_at`

**Relationships:** N ingredients → 1 supplier. 1 ingredient → N `ingredient_aliases`, N `invoice_lines`, N `price_history`, N `recipe_ingredients`.

---

## ingredient_aliases

Append-only audit trail of every raw OCR string seen for a given ingredient (the normalization evidence).

- `id`, `ingredient_id` (fk, cascade), `raw_text`, `created_at`

**Relationships:** N aliases → 1 ingredient. **No UI reads this table** — it's written by `/api/invoices/process` but never displayed or used for anything yet (e.g. to power a merge-suggestion UI in Sprint 2).

---

## recipes

The menu item / dish.

- `id`, `restaurant_id`
- `name`, `description`, `image_url`
- `category_id` (fk, optional, unused)
- `servings`, `sale_price`
- `status` (`active|inactive|draft`)
- `tags` (text array), `notes`
- `created_at`, `updated_at`

**Relationships:** 1 recipe → N `recipe_ingredients`, N `ai_recommendations`, N `sales_log`.

---

## recipe_ingredients

Join table: which ingredients (and how much) make up a recipe.

- `id`, `recipe_id` (cascade), `ingredient_id` (**restrict** — can't delete an ingredient that's used in a recipe), `quantity`, `unit`

**Relationships:** N—N between recipes and ingredients via this table.

---

## invoices

The uploaded document and its OCR extraction result.

- `id`, `restaurant_id`, `supplier_id` (fk, nullable until processed)
- `file_url`, `file_name`
- `supplier_name`, `supplier_cuit` (raw OCR snapshot fields — kept even though `supplier_id` now exists, for audit/fallback)
- `invoice_number`, `invoice_date`, `due_date`
- `total_amount`, `currency`
- `status` (`uploaded|processing|processed|review_required|failed`)
- `extracted_data` (jsonb — full raw OCR JSON blob)
- `ocr_confidence`
- `created_at`, `processed_at`

**Relationships:** 1 invoice → N `invoice_lines`, N `price_history` (audit link).

---

## invoice_lines

(Renamed from `invoice_items` in the Sprint 1 migration.) One row per line item on an invoice.

- `id`, `invoice_id` (cascade), `ingredient_id` (fk, no cascade rule specified — defaults to `NO ACTION`)
- `ingredient_name` (raw text as it appeared on the invoice)
- `quantity`, `unit`, `unit_price`, `total_price`
- `previous_price`, `price_change_pct` (computed at process-time, **not** historical — these are point-in-time snapshots for display only)
- `created_at`

**Relationships:** N lines → 1 invoice, N lines → 1 ingredient.

---

## price_history

Append-only ledger. **This table must never be updated or deleted from** — see `[[AGENTS.md]]` Principle 05 (Historical Integrity).

- `id`, `restaurant_id`, `ingredient_id` (cascade), `supplier_id`, `invoice_id`
- `price`, `unit`
- `recorded_at`

**Relationships:** N rows → 1 ingredient, N rows → 1 supplier, N rows → 1 invoice. Only inserted when `/api/invoices/process` detects a price different from the ingredient's last known price (or first sighting).

---

## ai_recommendations

Per-recipe AI suggestions (currently only generated on-demand from the Recipe Detail page, not persisted automatically).

- `id`, `restaurant_id`, `recipe_id` (cascade)
- `type` (`negotiate_supplier|adjust_price|review_ingredient|menu_mix`)
- `title`, `description`, `estimated_impact_pp`, `priority` (`high|medium|low`)
- `status` (`pending|applied|dismissed`)

**Note:** the AI Copilot route (`/api/ai/recommendations`) returns recommendations directly to the client and **never inserts into this table**. The table exists and is read by the Dashboard query, but nothing currently writes to it — it will always be empty until that gap is closed.

---

## sales_log

For future menu-mix analysis. Schema exists; **no UI, no API, and nothing inserts into it.**

- `id`, `restaurant_id`, `recipe_id` (cascade), `quantity`, `channel` (`salon|delivery|takeaway`), `sale_date`

---

## Database Functions & Triggers

| Name | Purpose |
|---|---|
| `handle_updated_at()` | Generic trigger, touches `updated_at` on `recipes`, `restaurants`, `suppliers` |
| `handle_new_user()` | On `auth.users` insert → creates a blank `profiles` row (`restaurant_id` null) |
| `get_my_restaurant_id()` | `security definer` helper used by every RLS policy to scope rows to the caller's restaurant |
| `get_recipe_cost(recipe_uuid)` | SQL function computing recipe cost from `recipe_ingredients` × `ingredients.current_price`, with kg/gr and lt/ml unit conversion. **Not used anywhere in the app** — all cost calculations are duplicated in JS instead (see Technical Debt Report) |

## Row-Level Security

Every business table has `restaurant_id = get_my_restaurant_id()` (or a join-through equivalent for child tables: `invoice_lines`, `ingredient_aliases`, `recipe_ingredients`). `profiles` is scoped by `auth.uid() = id`. This was verified live in production during the Sprint 1 rollout (two different logged-in accounts could not see each other's suppliers/ingredients/invoices).

**Gap:** API routes that use `createAdminClient()` / the raw service-role client (`/api/invoices/upload`, `/api/invoices/process`, `/api/auth/setup`, `/api/admin/*`) bypass RLS entirely by design (they need to write before a user session is fully scoped, or need cross-tenant access for admin). This is correct for those specific cases but means **any future route added with the service-role client also bypasses tenant isolation** — there's no enforced convention preventing that.
