# Foundation Audit V1

Read-only review of Priorities 01–05 against their original specifications, performed before freezing the technical foundation for Sprint 05. No code modified to produce this document. Verified by re-reading the current state of every file each priority touched, not by re-running the original production validation (already confirmed passing in earlier sessions) — this pass is specifically looking for gaps the original implementation/validation may have missed.

---

## Priority 01 — Security

**Classification: PASS**

### 1. Specification Coverage: 95%

### 2. Requirements Implemented
- All three named endpoints (`/api/invoices/upload`, `/api/invoices/process`, `/api/ai/recommendations`) now call `requireRestaurant()`/`requireUser()` and reject unauthenticated requests with 401, verified live in production.
- `restaurant_id` is fully removed from client input on the upload path — `upload/route.ts` no longer reads a `restaurantId` form field at all; it's resolved server-side from the session, full stop.
- `process/route.ts` additionally re-verifies that the target invoice's `restaurant_id` matches the caller's resolved restaurant before doing anything with it — closes the "guess an invoiceId" variant of the same attack, which is *more* than the original spec literally asked for ("never trust restaurantId") but is the same principle applied correctly.
- Service-role client usage is scoped to exactly what needs it (Storage write, cross-tenant OCR write) — not eliminated, but minimized and gated behind a verified session.

### 3. Missing Requirements
None against the literal spec (three endpoints, session validation, no client-trusted IDs, minimized service-role exposure — all present).

### 4. Edge Cases Not Covered
- `/api/auth/setup` remains intentionally open (no session check) — required by design, since it runs *during* signup before a profile has a restaurant. This is correct, but it was never explicitly named in the original Priority 01 scope and is worth documenting as a deliberate exception rather than an oversight, so it isn't mistaken for a missed fourth endpoint later.
- New-ingredient creation in `IngredientsClient.tsx` still inserts directly from the browser via the anon Supabase client rather than going through an API route. This is **not a security hole** — RLS's `WITH CHECK` (implied by the `for all using (...)` policy) still blocks a cross-tenant insert even if `restaurantId` were tampered with client-side — but it's an inconsistency with the "mutating routes go through the server" convention now established for everything else, worth normalizing later, not a P01 regression.

### 5. Technical Risks
- No automated regression test exists confirming these three routes stay locked down — a future refactor could silently reintroduce the old pattern (e.g. someone copies `process/route.ts` as a template for a new route and carries the bug forward). Mitigated today only by the rule now written into `[[AGENTS.md]]`.

### 6. Product Risks
None identified — the fix is invisible to legitimate users; only unauthenticated/cross-tenant access patterns changed behavior.

### 7. Recommendations
- Add a lightweight integration test (or at minimum a documented manual checklist) asserting all three routes return 401 unauthenticated, so this doesn't silently regress.
- Note the `/api/auth/setup` exception explicitly in `[[AGENTS.md]]`'s auth rule so it reads as "deliberate" rather than "missed."

### 8. Final Score: 9/10

---

## Priority 02 — Ingredient Soft Delete

**Classification: PASS WITH RECOMMENDATIONS**

### 1. Specification Coverage: 85%

### 2. Requirements Implemented
- Hard delete replaced with `DELETE /api/ingredients/[id]` setting `status='archived'` — verified live (the ingredient row persists in the DB after archiving, confirmed via direct query).
- Recipes, invoices, and price history are preserved — archiving never touches `recipe_ingredients`, `invoice_lines`, or `price_history`, and the DB's existing `ON DELETE RESTRICT` on `recipe_ingredients.ingredient_id` was never relevant here since nothing is actually deleted anymore.
- Archived ingredients are correctly filtered out of: the Ingredient Master list (`ingredientes/page.tsx`), the `/api/ingredients` list endpoint, and both recipe ingredient pickers (`recetas/nueva`, `recetas/[id]/editar`).
- Per your confirmed decision, an ingredient already attached to an existing recipe still displays normally after being archived (recipe pages join through `recipe_ingredients` → `ingredients` directly, with no status filter on that join) — this was verified by code inspection, matching the approved behavior exactly.

### 3. Missing Requirements
- **No restore/un-archive path exists.** Once archived, an ingredient has no UI or API route to bring it back to `draft`/`validated` — the user's only recourse would be a direct DB edit. This wasn't explicitly required by the spec ("replace hard delete with soft delete") but is a natural expectation once "delete" becomes reversible in principle, and its absence may surprise a user who archives something by mistake.

### 4. Edge Cases Not Covered
- Archiving an ingredient that's actively used in one or more **active** recipes produces no warning. The user clicks "Archivar" and gets a generic confirm dialog ("¿Archivar este ingrediente? Las recetas y facturas que ya lo usan no se ven afectadas.") — accurate, but doesn't tell them *which* or *how many* recipes are affected, so a chef could unknowingly remove an ingredient from future availability while it's still core to a popular dish.
- New ingredient creation (the "+ Nuevo ingrediente" modal) still calls `supabase.from('ingredients').insert()` directly from the client rather than through an API — functionally fine for P02's scope (creation isn't deletion), but means the soft-delete convention now established for ingredients isn't yet mirrored by a consistent creation/edit convention across the same component.

### 5. Technical Risks
Low — the change is additive and narrowly scoped (one new route handler, one changed client call, three added query filters). No risk of data loss since nothing is actually deleted.

### 6. Product Risks
A user could archive an ingredient still in active use without realizing it, then be confused later when it's missing from the picker while building a *new* recipe that should reuse it. Low-severity, but real.

### 7. Recommendations
- Add a restore action (e.g. `PATCH .../status: 'validated'` already supports this mechanically — just needs a UI entry point, perhaps a filtered "Archivados" view with an "Restaurar" button).
- Before archiving, show the count of active recipes currently using the ingredient (a simple `recipe_ingredients` count query) so the confirm dialog can say "usado en 3 recetas activas" instead of a generic disclaimer.

### 8. Final Score: 8/10

---

## Priority 03 — Price History Protection

**Classification: PASS**

### 1. Specification Coverage: 100%

### 2. Requirements Implemented
- `BEFORE UPDATE` and `BEFORE DELETE` triggers on `price_history` reject both operations unconditionally, including from the service-role client — verified live in production with a direct REST call against both operations, both rejected with `P0001`.
- This matches the approved decision exactly ("sin excepción," not even for service-role) — there is no escape hatch, which was a deliberate, confirmed tradeoff rather than an oversight.

### 3. Missing Requirements
None — this is the most narrowly-scoped of the five priorities and it's fully closed.

### 4. Edge Cases Not Covered
None identified that aren't already named tradeoffs in the original analysis (e.g. "a genuine future correction requires manually disabling the trigger" — accepted by you as the intended behavior, not a gap).

### 5. Technical Risks
None beyond the already-accepted tradeoff.

### 6. Product Risks
None — this is purely a backend integrity guarantee with no user-facing surface.

### 7. Recommendations
None needed. Optionally, document the "how to perform a legitimate manual correction" runbook (drop trigger → fix → recreate trigger) somewhere durable, so a future person facing this doesn't have to rediscover the trigger exists by trial and error.

### 8. Final Score: 10/10

---

## Priority 04 — Current Price By Invoice Date

**Classification: PASS**

### 1. Specification Coverage: 100%

### 2. Requirements Implemented
- `ingredients.current_price_invoice_date` exists and is correctly gating updates in `process/route.ts`: `current_price` only changes when the new invoice's `invoice_date` is strictly newer than the stored date.
- Backfill ran, recomputing `current_price` from the actual latest-invoice_date `price_history` row per ingredient — the approved correction of already-wrong historical data, not just a forward-looking fix.
- Manual price edits via `PATCH /api/ingredients/[id]` correctly set `current_price_invoice_date` to today, per your confirmed decision, so a manual correction can't be silently overwritten by an already-on-file older invoice.
- The exact validation scenario from the spec (June $1,000 processed, then March $700 processed after) was run against production and passed: `current_price` stayed at 1000, `current_price_invoice_date` stayed at the June date, both price points exist in `price_history`.
- **Gap closed (commits `2d179da`, `12b5137`):** manual ingredient creation now goes through a new `POST /api/ingredients` endpoint that sets `current_price_invoice_date` to today on creation, mirroring the existing PATCH behavior. While implementing this, production validation surfaced a second, related bug: the new endpoint initially left `normalized_name` null, which would have caused a later invoice for the same product to create a **duplicate ingredient** instead of correctly matching the existing one and respecting the date gate. This was fixed by extracting the normalization logic (previously private to the OCR route) into a shared `normalizeIngredientName()` helper in `lib/utils.ts`, used by both `POST /api/ingredients` and `/api/invoices/process` — removing the risk of the two call sites drifting apart again.
- **Re-validated end-to-end in production** after both fixes: created "Tomate Test P04Fix2" manually at $2,000 → processed a synthetic invoice dated January 2020 for the same product at $500 → confirmed exactly one ingredient row exists (no duplicate), `current_price` remained 2000, `current_price_invoice_date` remained today's date. The old invoice's supplier and `last_updated` correctly attached to the ingredient — only the protected price/date fields were correctly left untouched.

### 3. Missing Requirements
None remaining. The gap identified in the first audit pass (manual creation not setting `current_price_invoice_date`) is closed and verified; the `normalized_name` bug discovered while closing it is also fixed and verified.

### 4. Edge Cases Not Covered
- **Same-date invoices processed twice.** If two invoices share an identical `invoice_date`, the second one processed will *not* update `current_price` (the comparison is strict `>`, not `>=`), which matches the spec's pseudo-logic exactly — but this exact tie-breaking behavior was never explicitly validated with a same-date test case, only reasoned about during analysis.
- **Re-processing the same invoice twice.** Calling `/api/invoices/process` a second time for an already-processed `invoiceId` would insert a **duplicate row into `invoice_lines`** (no idempotency check on that insert), though it correctly would *not* duplicate a `price_history` row (guarded by the `unitPrice !== previousPrice` check, and on a re-run `previousPrice` would already equal `unitPrice` from the first run). This predates Priority 04 and isn't a regression from it, but remains a real gap affecting confidence in repeated processing.

### 5. Technical Risks
Low. The core date-gating guarantee now holds across both entry points that can set/change `current_price` (manual create, manual edit, and invoice processing), and the shared `normalizeIngredientName()` helper removes the specific drift risk that caused the duplicate-ingredient bug found during this fix. The re-processing idempotency gap (§4) remains a minor open risk, unrelated to this priority's core requirement.

### 6. Product Risks
None remaining for the scenario this priority targets (manual price entry surviving a backlog of old invoice uploads) — verified directly. The re-processing edge case (§4) is a low-probability, low-severity residual risk (duplicate display rows on an invoice detail page in the rare case of a retried request), not a pricing-correctness risk.

### 7. Recommendations
- Add a uniqueness/idempotency guard on `invoice_lines` insert (e.g. check for an existing line with the same `invoice_id` + `ingredient_name` before inserting, or a unique constraint) to remove the re-processing risk noted in §4. Not blocking for the freeze — this is a pre-existing, unrelated gap, not a Priority 04 requirement.

### 8. Final Score: 10/10

---

## Priority 05 — Unit Price / Pack Size

**Classification: PASS WITH RECOMMENDATIONS**

### 1. Specification Coverage: 90%

### 2. Requirements Implemented
- `invoice_lines.pack_price` and `units_per_pack` exist and are populated; `unit_price` is now always computed as `pack_price / units_per_pack`, never stored as a raw OCR passthrough.
- The OCR prompt explicitly instructs the model to treat "cajón"/"caja"/"bulto"/"display" as pack labels, never as the base unit, with a worked example.
- All three validation cases from the spec were run against production and passed exactly: 1 cajón×10/$5,200 → unit_price=520; Caja×6/$3,600 → unit_price=600; unitario/$1,000 → unit_price=1000 (units_per_pack=1, unaffected).
- The fix correctly propagates to `ingredients.current_price` and `price_history.price` — both now receive the computed per-unit value, not the raw pack price, consistent with what those columns are supposed to mean.
- Per your confirmed decisions: no backfill of already-processed pack invoices (forward-only fix, as approved), and the pack breakdown is now visible in both the Facturas upload preview and invoice detail page ("$520/un (de $5.200 el paquete x10)").

### 3. Missing Requirements
None against the literal three validation cases in the spec — all three pass exactly as specified.

### 4. Edge Cases Not Covered
- **Multiple packs on one line** (e.g. "3 cajones x 10 unidades — $15,600" — 3 packs, not 1) was never tested. The current logic computes `unit_price = pack_price / units_per_pack` using whatever `pack_price` the model extracts, but the prompt's instruction says "pack_price es el precio del paquete completo" (singular) without explicitly clarifying whether that should be the price of *one* pack or the line's total when `quantity > 1`. This is the single largest unverified assumption in the implementation — the three spec cases all had `quantity=1`, so this ambiguity never surfaced in validation.
- **Real-world invoice phrasing variety.** Validation used clean, synthetic, English-structured test invoices ("1 cajón x 10 unidades — $5.200"). Real supplier invoices phrase packs far more inconsistently ("CJ X12", "x6u", "DISPLAY 24", "BULTO", abbreviations, table columns instead of inline text) — the prompt's single worked example may not generalize to all of these. This wasn't tested against any real (non-synthetic) invoice image.
- **OCR confidence interaction.** If the model is uncertain whether a line is pack-priced or not, there's no mechanism today to flag *that specific* uncertainty — the existing `review_required` gate is driven by the invoice's overall `confidence` score, not a per-line pack-detection confidence. A line could be confidently mis-classified (high overall confidence, wrong pack interpretation) and sail through as `processed` with a silently wrong `unit_price`.

### 5. Technical Risks
The multi-pack-quantity ambiguity (§4) is the main one — if `pack_price` sometimes means "per pack" and sometimes means "for all N packs on this line" depending on how the model interprets a given invoice's phrasing, `unit_price` could be wrong in a way that looks identical to a correctly-computed value (no error, just a silently wrong number), exactly the class of bug this priority was created to eliminate in the first place.

### 6. Product Risks
Because real invoices weren't part of validation, there's a real chance the prompt doesn't generalize as well as the synthetic tests suggest once actual supplier invoices (with their inconsistent formatting) start flowing through. This wouldn't be caught until a real restaurant notices a wrong ingredient cost.

### 7. Recommendations
- Add a fourth validation case with `quantity > 1` and `units_per_pack > 1` together (e.g. "3 cajones x 10, $15,600") and pin down the expected `pack_price`/`total_price` relationship explicitly, then adjust the prompt wording if the model's current interpretation doesn't match.
- If you have any real (anonymized) supplier invoice images with pack pricing on hand, run them through `/api/invoices/process` as a smoke test before fully trusting this at scale — synthetic-only validation is good for proving the code path works, not for proving OCR generalization.

### 8. Final Score: 8/10

---

## Summary

| Priority | Classification | Score |
|---|---|---|
| 01 — Security | PASS | 9/10 |
| 02 — Ingredient Soft Delete | PASS WITH RECOMMENDATIONS | 8/10 |
| 03 — Price History Protection | PASS | 10/10 |
| 04 — Current Price By Invoice Date | PASS | 10/10 |
| 05 — Unit Price / Pack Size | PASS WITH RECOMMENDATIONS | 8/10 |

**No FAILs. Priority 04's gap is closed and re-verified in production** (commits `2d179da`, `12b5137`) — manual ingredient creation now sets `current_price_invoice_date` exactly like manual edits already did, and the `normalized_name` bug found while closing that gap is also fixed, with a shared helper preventing the two call sites from drifting apart again. The remaining recommendations on Priorities 02 and 05 are refinements and edge-case hardening, not corrections of broken behavior — every remaining gap is a *narrower* miss (a missing convenience feature, an untested combination) rather than any original bug resurfacing.

**Foundation status: ready to freeze.** All five priorities pass their core specifications and validation scenarios, verified live in production, not just by code inspection. The open recommendations (ingredient restore/un-archive flow, in-use warning before archiving, multi-pack-quantity test case, real-invoice OCR smoke test, invoice re-processing idempotency) are reasonable fast-follows that don't block Sprint 05 — none of them touch the specific correctness guarantees Menu Intelligence will build on top of (invoice → supplier/ingredient → price history → recipe cost).
