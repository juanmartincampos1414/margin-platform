-- Corrective migration. Migration 0007's regex (x\s*\d{1,3}\s*$) matched
-- the end of a string too loosely — it false-positived on:
--   - dimension notation on textiles/cloths ("48x58", "60X70", "40x40" —
--     centimeter measurements, not a pack size)
--   - a test fixture name ending in "...P04Fix2" (the letters "Fix" happen
--     to end in "x", followed by the digit "2")
-- Reverts those specific invoice_lines back to their pre-0007 state
-- (units_per_pack=1, unit_price = the already-correct pack_price, which
-- 0007 left untouched). Recomputes current_price for the real affected
-- ingredients directly from invoice_lines (not price_history — 0007 also
-- inserted erroneous price_history rows for these same lines, and that
-- table is append-only by explicit design, so those bad rows cannot be
-- removed; recomputing from price_history would just pick them up again).

update public.invoice_lines
set units_per_pack = 1, unit_price = pack_price
where id in (
  '04d77b89-3bc6-4b55-884b-8f8f5baeea37', -- CLEANTEX REPASADOR FRANCES C/GUARDA 48x58
  '0b85a89a-16f3-4421-a744-f514c3cd020d', -- CLEANTEX REPASADOR FRANCES C/GUARDA 48x58
  'b7c35aa1-0faf-44cc-b544-43631607d35a', -- CLEANTEX T. DE PISO BLANCO CONSORCIO 60X70
  '37abf4a8-5803-4335-865d-36057feaddcc', -- ROYCO MICROFIBRA MULTIUSO SOFT AZUL 40x40
  'e27119c6-a4ea-46d1-9edc-b100de74edef'  -- Tomate Test P04Fix2 (test fixture)
);

-- Tomate Test P04Fix2 has a confirmed manual price override
-- (current_price_invoice_date = today) that 0007's blind "latest by
-- invoice_date in price_history" recompute incorrectly bypassed. Restore
-- it directly to the known-correct manual value.
update public.ingredients
set current_price = 2000, current_price_invoice_date = current_date
where id = 'a325f0a7-1f7b-4dba-b565-d6fa1494dafa';

-- Recompute current_price for the real (non-test) ingredients affected,
-- from the now-corrected invoice_lines directly.
with latest_line_per_ingredient as (
  select il.ingredient_id, il.unit_price, inv.invoice_date,
    row_number() over (partition by il.ingredient_id order by inv.invoice_date desc nulls last, il.id desc) as rn
  from public.invoice_lines il
  join public.invoices inv on inv.id = il.invoice_id
  where il.ingredient_id in (
    '96a25a63-f4c0-42a7-9f06-9f67a6a2f076', -- CLEANTEX REPASADOR FRANCES C/GUARDA 48x58
    '3b0c4462-64de-43d9-812a-f6ef846565fc', -- CLEANTEX T. DE PISO BLANCO CONSORCIO 60X70
    '55d67c20-b4ef-4451-b198-56546a7acca1'  -- ROYCO MICROFIBRA MULTIUSO SOFT AZUL 40x40
  )
)
update public.ingredients i
set current_price = latest.unit_price, current_price_invoice_date = latest.invoice_date
from latest_line_per_ingredient latest
where latest.ingredient_id = i.id and latest.rn = 1 and latest.invoice_date is not null;
