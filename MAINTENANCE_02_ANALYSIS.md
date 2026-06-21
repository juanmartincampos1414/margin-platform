# Maintenance 02 — Current Price By Invoice Date — Analysis

Read-only analysis. No code changed to produce this document.

## 1. Tables Affected

- **`ingredients`** — `current_price` is updated unconditionally on every invoice process call, with no awareness of *which* invoice date last set it. This is the table that needs a new column.
- **`price_history`** — already correctly append-only (verified by the Priority 03 trigger) and already has everything needed to backfill/audit the fix (`ingredient_id`, `price`, `invoice_id`, `recorded_at`). **No structural change needed here** — but note `recorded_at` is the *processing* timestamp, not the invoice date; the invoice date has to be joined in via `invoice_id → invoices.invoice_date` when needed for analysis.
- **`invoices`** — `invoice_date` already exists and is exactly the field that should be driving the comparison. No change needed here.
- **`invoice_lines`** — unaffected structurally; `previous_price`/`price_change_pct` are point-in-time display fields computed at process time, not used for the current-price decision today and won't be used for it after the fix either (see Current Logic below for why this matters).

## 2. Services Affected

There's no separate service layer in this codebase — business logic lives inline in the route handlers (see [`ARCHITECTURE_AUDIT_V1.md`](ARCHITECTURE_AUDIT_V1.md) §3). The relevant logic block is the per-line-item loop inside `/api/invoices/process`, specifically the "match/update existing ingredient" branch.

## 3. Controllers Affected

- **`src/app/api/invoices/process/route.ts`** — the only place that writes to `ingredients.current_price`. This is the sole controller requiring a logic change.
- No other route writes `current_price` directly. `PATCH /api/ingredients/[id]` *can* update `current_price` (manual correction by a user) — that's a deliberate, explicit user action and is out of scope for this fix (a human manually editing a price should win regardless of invoice dates; this stays as-is).

## 4. Current Logic (the bug)

In `process/route.ts`, lines ~171–182, for every invoice line item matched to an existing ingredient:

```ts
if (ingredient) {
  ingredientId = ingredient.id
  previousPrice = ingredient.current_price
  await adminSupabase
    .from('ingredients')
    .update({
      current_price: item.unit_price ?? ingredient.current_price,   // ← always overwrites
      unit: item.unit || ingredient.unit,
      supplier_id: supplierId,
      last_updated: new Date().toISOString(),
    })
    .eq('id', ingredientId)
}
```

This runs once per invoice, regardless of that invoice's `invoice_date` relative to whichever invoice last set the current price. There is no stored reference to "which invoice date is the current price based on," so there's nothing to compare against even if someone wanted to add a check today — that's exactly the missing column identified in §5 below. Processing order (upload order) is the only thing that currently determines the final value of `current_price`, which is the reported bug.

`price_history` itself is unaffected by this bug — every price seen is correctly appended (Priority 03 confirmed this is structurally enforced). The bug is entirely in what `ingredients.current_price` reflects, not in what's recorded historically.

## 5. Migration Requirements

**Confirmed: `current_price_invoice_date` does not exist** in `ingredients` (checked `supabase/schema.sql` directly).

Proposed migration:

```sql
alter table public.ingredients
  add column current_price_invoice_date date;

-- Backfill: for each ingredient, set it to the invoice_date of whichever
-- price_history row is currently reflected by current_price — approximated
-- here as the most recent price_history entry per ingredient, joined to its
-- invoice's invoice_date. This is a best-effort backfill since the bug means
-- current_price may not actually correspond to the latest invoice_date today.
update public.ingredients i
set current_price_invoice_date = sub.invoice_date
from (
  select ph.ingredient_id, inv.invoice_date,
         row_number() over (partition by ph.ingredient_id order by inv.invoice_date desc nulls last, ph.recorded_at desc) as rn
  from public.price_history ph
  join public.invoices inv on inv.id = ph.invoice_id
) sub
where sub.ingredient_id = i.id and sub.rn = 1;
```

**Backfill caveat to flag explicitly, not assume:** because the bug has been live since Sprint 1, some ingredients' *current* `current_price` value may not actually match any invoice's price at all consistently with "latest invoice_date" — e.g. if upload order already caused an older invoice to overwrite a newer one. The backfill above sets `current_price_invoice_date` to match the latest invoice_date on file, but does **not** retroactively correct `current_price` itself to match that date's price. That's a judgment call — see Validation/Risks below, this should be confirmed with you before running, not assumed.

## 6. Impact on Recipes

Recipe cost calculation (`recetas`, `recetas/[id]`, `analisis`, and the dead `get_recipe_cost()` SQL function) all read `ingredients.current_price` directly — none of them change structurally. Once `current_price` is correctly anchored to the latest invoice date, recipe costs automatically become correct with no changes needed to any recipe-related file. This fix is entirely upstream of recipes.

## 7. Impact on Food Cost

Same as Recipes — Food Cost % is derived from recipe cost ÷ sale price, which is derived from `ingredients.current_price`. No direct code changes needed in Margin Intelligence pages; food cost figures will simply become accurate once the upstream value is fixed. Worth noting: if the backfill caveat in §5 means some current prices are presently wrong, food cost figures shown today for affected ingredients are *also* presently wrong — fixing the write path going forward won't retroactively correct already-wrong current prices unless we also decide to recompute them (see Risks).

## 8. Impact on Supplier Intelligence

`proveedores/[id]`'s "Average Price Variation" and the price evolution chart read from `price_history` directly (not from `current_price`), so they are **unaffected** by this bug today and require no change — they already correctly show every price point in time order. Sprint 06 (not started) will build further on `price_history`, which is already correct; this fix has no bearing on that sprint's readiness, already noted in the original audit.

## Required Fix (proposed, pending approval)

In `process/route.ts`, replace the unconditional update with a date-gated one:

```ts
if (ingredient) {
  ingredientId = ingredient.id
  previousPrice = ingredient.current_price

  const newDate = extracted.invoice_date ? new Date(extracted.invoice_date) : null
  const currentDate = ingredient.current_price_invoice_date ? new Date(ingredient.current_price_invoice_date) : null
  const shouldUpdateCurrentPrice =
    item.unit_price != null && newDate && (!currentDate || newDate > currentDate)

  await adminSupabase
    .from('ingredients')
    .update({
      ...(shouldUpdateCurrentPrice
        ? { current_price: item.unit_price, current_price_invoice_date: extracted.invoice_date }
        : {}),
      unit: item.unit || ingredient.unit,
      supplier_id: supplierId,
      last_updated: new Date().toISOString(),
    })
    .eq('id', ingredientId)
}
```

`price_history` insertion is unaffected — it already runs unconditionally whenever the observed price differs from the ingredient's last known price, and should keep doing so regardless of date order, per "historical uploads should enrich history."

**Open question, not assumed:** what happens if `extracted.invoice_date` is null (OCR couldn't read it)? Proposed default: skip updating `current_price`/`current_price_invoice_date` (treat a dateless invoice as never "newer"), but still record it in `price_history` and `invoice_lines` as today. Flagging this for your confirmation before implementing, since it's a real behavioral choice, not an obvious default.

## Validation Plan (Step 3, after approval + implementation)

Reproduce the exact scenario from the spec against production:
1. Upload Invoice A (June 2026, Water = $1,000) → expect `current_price = 1000`, `current_price_invoice_date = 2026-06-XX`
2. Upload Invoice B (March 2026, Water = $700) → expect `current_price` **unchanged at 1000**, `price_history` now has 2 rows for Water ($1,000 and $700, distinguishable by their linked invoice's date), `current_price_invoice_date` unchanged at the June date

## Risks

- **Retroactive correctness of already-wrong `current_price` values is a separate decision from fixing the write path.** Fixing `process/route.ts` only prevents *future* mis-ordering; it does not fix ingredients whose `current_price` is already wrong today due to past out-of-order uploads. Recommend a one-time backfill query (recompute `current_price` from the actual latest-invoice_date `price_history` row per ingredient) as a follow-up step — but only with your explicit go-ahead, since it changes live data values users may already be seeing/relying on.
- **Two invoices with the identical `invoice_date`.** The pseudo-logic in the spec (`new_invoice_date > current_price_invoice_date`) means a same-date invoice processed second would *not* update current price, even if it's a genuine same-day correction. Worth confirming this is acceptable (likely yes — ties are rare and processing order within a day is arguably arbitrary anyway), flagging rather than assuming.
- **Manual price edits via `PATCH /api/ingredients/[id]`** don't set `current_price_invoice_date` at all today. After this fix, a manual edit would leave `current_price_invoice_date` stale (still pointing at whatever invoice last set it), and a *later-dated* invoice could then silently overwrite the manual correction the next time it's processed. This is a real edge case worth a decision: should manual edits set `current_price_invoice_date` to today's date (so only a *future*-dated invoice can override it), or leave it null/unchanged? Recommend the former; flagging for confirmation rather than assuming.
