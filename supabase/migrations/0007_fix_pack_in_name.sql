-- Backfill: invoice lines whose product name itself ends in "xN" (a pack
-- size embedded in the name, e.g. "Agua con gas 0.5 Lts Vidrio x12") were
-- extracted with units_per_pack=1 before this fix, so the full case price
-- was stored as if it were a per-unit price. This corrects invoice_lines
-- deterministically and adds a corrected price_history entry — it never
-- updates or deletes an existing price_history row, since that table is
-- append-only by design (Hard Rule: historical integrity).

with affected as (
  select
    il.id,
    il.unit_price as original_price,
    (regexp_match(il.ingredient_name, 'x\s*(\d{1,3})\s*$', 'i'))[1]::int as detected_pack
  from public.invoice_lines il
  where il.units_per_pack = 1
    and il.unit_price is not null
    and il.ingredient_name ~* 'x\s*\d{1,3}\s*$'
),
filtered as (
  select * from affected where detected_pack > 1
),
updated as (
  update public.invoice_lines il
  set
    pack_price = coalesce(il.pack_price, filtered.original_price),
    units_per_pack = filtered.detected_pack,
    unit_price = round(filtered.original_price / filtered.detected_pack, 2)
  from filtered
  where il.id = filtered.id
  returning il.id, il.ingredient_id, il.invoice_id, il.unit, il.unit_price
)
insert into public.price_history (restaurant_id, ingredient_id, supplier_id, invoice_id, price, unit)
select inv.restaurant_id, updated.ingredient_id, inv.supplier_id, updated.invoice_id, updated.unit_price, updated.unit
from updated
join public.invoices inv on inv.id = updated.invoice_id;

-- Recompute current_price only for the ingredients touched by this fix,
-- using the same "latest by invoice_date" rule as the Priority 04 backfill
-- — never touch ingredients outside this fix's blast radius.
with touched_ingredients as (
  select distinct ingredient_id
  from public.invoice_lines
  where ingredient_name ~* 'x\s*\d{1,3}\s*$' and units_per_pack > 1
),
latest_per_ingredient as (
  select ph.ingredient_id, ph.price, inv.invoice_date,
    row_number() over (partition by ph.ingredient_id order by inv.invoice_date desc nulls last, ph.recorded_at desc) as rn
  from public.price_history ph
  join public.invoices inv on inv.id = ph.invoice_id
  where ph.ingredient_id in (select ingredient_id from touched_ingredients)
)
update public.ingredients i
set current_price = latest.price, current_price_invoice_date = latest.invoice_date
from latest_per_ingredient latest
where latest.ingredient_id = i.id and latest.rn = 1 and latest.invoice_date is not null;
