# Maintenance 03 — Unit Price / Pack Size — Analysis

Read-only analysis. No code changed to produce this document.

## 1. Current Implementation

The OCR prompt in `/api/invoices/process/route.ts` asks Claude to extract, per line item:

```json
{ "ingredient_name": "...", "quantity": number, "unit": "kg/lt/un/etc", "unit_price": number, "total_price": number }
```

There is **no concept of packs at all** in the prompt or the downstream logic. For an invoice line like "1 cajón x 10 unidades — $5,200", the model has no instruction distinguishing "price of the pack" from "price of one unit" — it extracts whatever number is printed next to the line as `unit_price`, and whatever count is printed as `quantity`. In practice this means:

- `quantity = 1`, `unit = "cajón"` (or sometimes "un", depending on how the invoice is laid out), `unit_price = 5200`, `total_price = 5200`.

That `unit_price` (5200) then flows, unmodified, into three places:
1. `invoice_lines.unit_price` — stored as-is
2. `ingredients.current_price` — set directly to `item.unit_price` (5200), gated only by the M02 invoice-date check, with no pack-awareness
3. `price_history.price` — the same raw 5200, appended whenever it differs from the ingredient's last known price

So the bug isn't in a calculation step that's wrong — there is **no calculation step at all**. The system has always assumed "the price printed on the invoice line is the per-base-unit price," which is true for unitary products but false for anything sold by pack/box/case, and nothing in the schema or the code currently has the information needed to tell those two cases apart.

## 2. Tables Affected

- **`invoice_lines`** — needs new columns to capture pack structure (`pack_price`, `units_per_pack`) since this is the only table that records what was literally printed on the invoice line. **This is the one schema change required.**
- **`ingredients.current_price`** — no schema change, but its write-path must change to receive a *computed* per-base-unit price instead of the raw OCR value.
- **`price_history.price`** — no schema change, same write-path correction applies — it must keep storing the corrected per-base-unit price, never the pack price, to stay consistent with what `current_price` means.

## 3. Services Affected

Same as M02 — no separate service layer exists in this codebase; the relevant logic lives inline in the route handler. The change is entirely in the per-line-item loop of `/api/invoices/process/route.ts`: the OCR prompt (what we ask Claude to extract) and the section that writes to `invoice_lines`/`ingredients`/`price_history` (what we do with what it returns).

## 4. Controllers Affected

- **`src/app/api/invoices/process/route.ts`** — sole controller that writes pricing data anywhere in the system. This is the only route requiring a logic change.
- `PATCH /api/ingredients/[id]` (manual price edit) is **not affected** — a human manually typing a price is already understood to be a final per-unit price; no pack semantics apply there.

## 5. Database Impact

Two new nullable columns on `invoice_lines`:
- `pack_price numeric(12,2)` — the price actually printed on the invoice line (what's currently miscast as `unit_price`)
- `units_per_pack integer default 1` — how many base units make up that pack (10 in the example; defaults to 1 for unitary products, so `unit_price = pack_price / units_per_pack` degenerates correctly to the simple case)

`invoice_lines.unit_price` **keeps its existing meaning** going forward — "price per base unit" — but will now be a *computed* value (`pack_price / units_per_pack`) rather than a raw OCR passthrough. No rename needed; the column already means the right thing, it's just been populated incorrectly.

No schema change needed on `ingredients` or `price_history` — both already just store "a price," and will now correctly receive the computed per-unit value instead of the raw pack value.

## 6. Migration Requirements

```sql
alter table public.invoice_lines
  add column if not exists pack_price numeric(12,2),
  add column if not exists units_per_pack integer not null default 1;
```

**Backfill question — same shape as M02, flagging rather than assuming:** any ingredient currently purchased by the case/pack already has a *wrong* `current_price` (and wrong historical `price_history` entries) sitting in production today — e.g. if "Agua" from Alimentos y Bebidas Congreso S.A. was already processed before this fix, its `current_price` is likely 10x too high right now. Backfilling `invoice_lines.pack_price`/`units_per_pack` retroactively isn't mechanically possible without re-reading the original invoice files (the pack size was never captured, so we can't reconstruct it from `quantity`/`unit_price` alone — a `unit_price` of 5200 looks identical whether it's a real $5,200 unit or a miscast pack price). **Proposed options, not assumed:**
- (a) Leave historical data as-is, fix only the write path going forward (cheapest, but known-wrong prices persist for already-processed pack products until a new invoice for them comes in)
- (b) Re-run OCR processing against the original invoice files (`invoices.file_url`) for invoices whose extracted line items look pack-shaped (e.g. unit text contains "caja", "cajón", "pack", "bulto", "display"), now that the prompt knows to extract pack structure — this would correct them properly instead of guessing
- I'd lean toward (b) for accuracy, but it touches already-processed invoices and re-triggers OCR spend, so this needs your decision, not mine.

## 7. Impact on Recipe Engine

No structural change — recipes still read `ingredients.current_price` assuming "price per base unit," which has always been the contract; this fix makes the *value* match the contract instead of changing the contract. Once fixed, recipe costs for pack-purchased ingredients become correct automatically, with zero recipe-side code changes. Same caveat as §6: any recipe currently using an ingredient whose `current_price` is wrong today shows a wrong cost today, and will keep doing so until either a new invoice corrects it or a backfill is run.

## 8. Impact on Food Cost

Derivative of Recipe Engine — same situation, no direct code changes, accuracy improves automatically going forward, already-wrong values persist until corrected per the §6 decision.

## 9. Impact on Supplier Intelligence

`price_history`-driven features (price evolution chart, average price variation on `proveedores/[id]`) are reading the same currently-corrupted-for-pack-products values. Going forward, new `price_history` rows will be correct per-unit prices. Historical rows for pack products remain wrong unless §6(b) is chosen — until then, the price evolution chart for an ingredient like "Agua" could show a misleadingly huge "price" that's actually a pack price, and any variation % computed against it would be meaningless. No schema/code change needed in the supplier pages themselves — they already just display whatever's in `price_history`.

## 10. Files to Modify

- **`src/app/api/invoices/process/route.ts`** — the only file with real logic changes:
  - OCR prompt: add `pack_quantity` (number of packs on the line, e.g. 1), `units_per_pack` (e.g. 10), `pack_price` (e.g. 5200) as extraction fields, with the base `unit` continuing to mean the *base* unit (kg/lt/un) the recipe/ingredient system already uses — not "cajón"
  - Per-line-item loop: compute `const unitPrice = pack_price / (units_per_pack || 1)` and use **that** (not the raw extracted value) everywhere `item.unit_price` is currently used — for `invoice_lines.unit_price`, `ingredients.current_price`, and `price_history.price`. Store `pack_price`/`units_per_pack` on `invoice_lines` as-is for transparency/audit.
- **`supabase/migrations/000X_unit_price_pack_size.sql`** (new) + **`supabase/schema.sql`** — the two new columns.
- **`src/app/(app)/facturas/[id]/page.tsx`** and **`src/app/(app)/facturas/subir/UploadInvoice.tsx`** — display-only change, not strictly required for correctness, but recommended: show "$520/un (de $5.200 el cajón x10)" instead of just the unit price, so a human reviewing a `review_required` invoice can actually verify the pack math was applied correctly. Flagging as a recommendation, not assuming it's in scope — happy to skip if you want this maintenance task to stay backend-only.

## Validation Plan (matches the spec's 3 cases exactly)

Using the same synthetic-invoice-via-browser technique used for M02 validation:
- **Case 01:** "1 cajón x 10, $5,200" → expect `pack_price=5200`, `units_per_pack=10`, `unit_price=520`
- **Case 02:** "Caja x 6, $3,600" → expect `pack_price=3600`, `units_per_pack=6`, `unit_price=600`
- **Case 03:** "Producto unitario, 1 unidad, $1,000" → expect `units_per_pack=1` (default), `unit_price=1000` (unchanged from today's correct behavior for unitary products)

## Open Questions (flagging per Rule 05 — not assuming)

1. **Backfill choice for already-processed pack invoices** (§6) — leave as-is, or re-OCR them?
2. **Should the pack-price breakdown be visible in the Facturas UI** (§10), or is this purely a backend data-correctness fix for now?
3. **OCR reliability for pack detection** — invoices phrase this many ways ("cajón x10", "caja de 6", "display 24un", "bulto"). The prompt will need several examples to generalize; worth a quick look at a few real invoice photos (if you have any on hand) before finalizing the prompt wording, rather than guessing at phrasing in the abstract.
