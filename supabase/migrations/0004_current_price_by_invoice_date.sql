-- Maintenance 02: current_price must reflect the most recent invoice_date,
-- not upload/processing order. Adds the missing reference column and
-- backfills both the date and a corrected current_price from the actual
-- latest-invoice_date price_history row per ingredient (approved backfill —
-- this corrects already-wrong values caused by the prior out-of-order bug,
-- not just the write path going forward).

alter table public.ingredients
  add column if not exists current_price_invoice_date date;

with latest_per_ingredient as (
  select
    ph.ingredient_id,
    ph.price,
    inv.invoice_date,
    row_number() over (
      partition by ph.ingredient_id
      order by inv.invoice_date desc nulls last, ph.recorded_at desc
    ) as rn
  from public.price_history ph
  join public.invoices inv on inv.id = ph.invoice_id
)
update public.ingredients i
set
  current_price = latest.price,
  current_price_invoice_date = latest.invoice_date
from latest_per_ingredient latest
where latest.ingredient_id = i.id
  and latest.rn = 1
  and latest.invoice_date is not null;
