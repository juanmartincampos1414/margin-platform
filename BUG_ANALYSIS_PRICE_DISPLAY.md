# Bug Analysis — Ingredients Page Showing Pack Price Instead of Unit Price

Read-only analysis. No code changed to produce this document. Investigated against the live production record for "Agua con gas 0.5 Lts Vidrio x12" (`ingredients.id = 03b38b31-c5bc-405a-b052-a3f49f35e479`).

## 1. Which Field Is Currently Displayed on the Ingredients Page

[`IngredientsClient.tsx:151`](src/app/(app)/ingredientes/IngredientsClient.tsx:151):

```tsx
<td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(ing.current_price)}</td>
```

The page displays `ingredients.current_price` — the same field [`recetas/page.tsx:34`](src/app/(app)/recetas/page.tsx:34) uses for Recipe Engine cost calculation (`ri.quantity * ri.ingredients.current_price / ratio`). There is no separate `pack_price` column on the `ingredients` table at all — `pack_price` only exists on `invoice_lines`, per invoice line, never on the ingredient record itself.

## 2. Is the UI Showing `pack_price` Instead of `unit_price`?

**No — not structurally.** The UI is reading `current_price`, which is exactly the field that's *supposed* to hold the normalized per-unit price. There is no code path where the UI substitutes `pack_price` for `current_price`. The bug is not a wrong-field-read in the component.

## 3. Does the Database Contain Both Values Correctly?

**No — this is the actual root cause.** Querying the real production data for this ingredient's two invoice lines:

```json
[
  { "ingredient_name": "Agua con gas 0.5 Lts Vidrio x12", "unit_price": 5206.61, "pack_price": null, "units_per_pack": 1, "total_price": 52066.12, "quantity": 10 },
  { "ingredient_name": "Agua con gas 0.5 Lts Vidrio x12", "unit_price": 5206.61, "pack_price": null, "units_per_pack": 1, "total_price": 15619.83, "quantity": 3 }
]
```

`units_per_pack = 1` and `pack_price = null` for **both** lines. The OCR extraction never recognized this as a 12-unit pack — it extracted the full case price ($5,206.61) as if it were the price of one unit, with no pack breakdown at all. `ingredients.current_price` (5206.61) and the two `price_history` rows (5206.61 each) are simply propagating that already-wrong `unit_price` downstream exactly as designed — the date-gating and propagation logic from Priority 04/05 are working correctly; they're just propagating bad input.

**Why the extraction missed it:** the pack size isn't stated as a separate quantity/pack annotation the way the Priority 05 prompt's worked example expects (e.g. "1 cajón x 10 unidades — $5.200"). Here, the "x12" is embedded directly inside the product's own name/description ("...Vidrio **x12**"), which is a different invoice phrasing convention the current OCR prompt was never given an example of. This is precisely the gap flagged in `FOUNDATION_AUDIT_V1.md`'s Priority 05 section (§4, "Real-world invoice phrasing variety... wasn't tested against any real (non-synthetic) invoice image") — now confirmed against a real production invoice rather than a hypothetical.

## 4. Are Recipe Engine and Food Cost Already Using `unit_price`/`current_price` Correctly?

**Yes, the mechanism is correct — they read `current_price` directly and consistently, the same field everywhere (Ingredients page, Recipe Engine cost calc).** There's no inconsistency between modules in *which* field they read. The problem is that for this specific ingredient, the value stored in that field is wrong by a factor of ~12x, so any recipe that uses "Agua con gas 0.5 Lts Vidrio x12" is currently overstating its food cost by roughly 12x for that ingredient's contribution. Margin Intelligence and Supplier Intelligence, which both build on `current_price`/`price_history`, inherit the same distortion.

## 5. Is This a UI Issue or a Data Issue?

**Data issue, originating in OCR extraction — not a UI bug.** No code path here is silently swapping `pack_price` for `current_price`; there isn't even a `pack_price` field on `ingredients` to confuse with. The Ingredients page is correctly displaying whatever is in `current_price`; that value itself is wrong because the extraction prompt didn't recognize "x12" embedded in a product name as a pack-size signal, so `units_per_pack` stayed at its default of 1 and the full case price was stored as if it were a per-unit price.

## Conclusion

This is **not** the bug pattern described in the report (UI displaying a separate pack-price field). It's the specific real-world OCR generalization gap already called out as an open risk in Priority 05's audit: the worked example in the extraction prompt only covers pack size stated as a separate quantity annotation ("1 cajón x 10"), not pack size embedded inside the product name itself ("...x12"). The fix belongs in the OCR prompt (recognize a trailing "xN" in the product name as a pack-size signal when no separate pack annotation is present) plus a backfill/re-flag of any ingredient whose `current_price` was set from a line with `units_per_pack = 1` but whose name contains an unparsed "xN" pattern — both are implementation changes, not made in this analysis pass per your instruction.

No code was modified to produce this document.
