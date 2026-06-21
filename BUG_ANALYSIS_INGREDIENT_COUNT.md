# Bug Analysis — Dashboard vs Ingredients Page Count Mismatch

Read-only analysis. No code changed to produce this document.

## 1. How Dashboard Calculates Ingredient Count

[`src/app/dashboard/page.tsx:28-31`](src/app/dashboard/page.tsx):

```ts
const { data: ingredients } = await supabase
  .from('ingredients')
  .select('id')
  .eq('restaurant_id', restaurantId)
```

Then [`ingredientCount={ingredients?.length || 0}`](src/app/dashboard/page.tsx:55) is passed straight into `DashboardContent`, which renders it with no further filtering. **This query has no `status` filter at all** — it counts every row in `ingredients` for the restaurant, regardless of `draft`, `validated`, `merged`, or `archived`.

## 2. How Ingredients Page Calculates Ingredient Count

[`src/app/(app)/ingredientes/page.tsx:16-21`](src/app/(app)/ingredientes/page.tsx):

```ts
const { data: ingredients } = await supabase
  .from('ingredients')
  .select('*, suppliers(id, name)')
  .eq('restaurant_id', profile?.restaurant_id)
  .neq('status', 'archived')
  .order('name')
```

The count shown on this page (`{ingredients.length} ingredientes registrados` in `IngredientsClient.tsx`) comes from this same array's length. **This query explicitly excludes `status = 'archived'`** via `.neq('status', 'archived')` — this filter was added as part of Priority 02 (soft delete), specifically so archived ingredients disappear from the active list.

## 3. Are Archived Ingredients Included in Dashboard Metrics?

**Yes.** This is the root cause. The Dashboard query was never updated when Priority 02 introduced the `archived` status — it still counts every row unconditionally, including archived ones. The Ingredients page query *was* updated at that time. The two queries have been inconsistent since Priority 02 shipped; this bug report is the first time the discrepancy was actually noticed and quantified (207 vs. 178 → a gap of 29, which should equal exactly the number of currently-archived ingredients for that restaurant).

## 4. Are Soft-Deleted Ingredients Being Counted Incorrectly?

Yes, specifically on the Dashboard. To be precise about the mechanism: nothing is "counted incorrectly" in the sense of a calculation bug — the Dashboard's count is *accurate for what it's actually querying* (all ingredients, any status). The bug is that what it's querying doesn't match what "ingredient count" is supposed to mean post-Priority-02: an **active** ingredient count, excluding archived. The Ingredients page already implements the correct definition; the Dashboard simply never adopted it.

## 5. Any Other Source of Discrepancy

Checked and ruled out:
- **Different restaurant scoping** — both queries resolve `restaurant_id` the same way (from `profiles.restaurant_id` via the authenticated session) and use the same server-side Supabase client (RLS-respecting, not service-role). No tenant-isolation discrepancy possible here.
- **Pagination/limits** — neither query has a `.limit()`, so neither is truncating results.
- **RLS policy difference** — both queries run through `createClient()` (the same cookie-based session client), so the same RLS policy (`tenant isolation - ingredients`) applies identically to both.
- **Join inflating count** — the Ingredients page query joins `suppliers(id, name)`, but this is a to-one relationship (`ingredients.supplier_id → suppliers.id`), which does not duplicate rows the way a to-many join would. Not a source of the discrepancy.

**Conclusion: the entire 29-ingredient gap is fully explained by the missing `status != 'archived'` filter on the Dashboard query.** No other discrepancy source was found. This is a single-line fix (add the same `.neq('status', 'archived')` filter already used on the Ingredients page) — once confirmed, I'll apply it in a follow-up, not in this analysis pass.

## Expected Behavior (confirmed against your statement)

```
Dashboard ingredient count
  =
Ingredients page ingredient count
  =
count(ingredients where restaurant_id = X and status != 'archived')
```

Both surfaces should query identically. The Ingredients page's current logic is correct and should be treated as the source of truth, per your statement — the fix is to bring the Dashboard query in line with it, not the other way around.
