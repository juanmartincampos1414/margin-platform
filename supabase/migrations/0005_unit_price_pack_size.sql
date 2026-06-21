-- Maintenance 03: distinguish pack price from per-unit price.
-- An invoice line like "1 cajón x 10 unidades — $5,200" must store the
-- pack price (5200) and pack size (10) separately, so unit_price can be
-- correctly computed as pack_price / units_per_pack (520), instead of the
-- pack price being miscast as the per-unit price.
--
-- No backfill: already-processed invoices keep whatever unit_price they
-- have today (decision: fix forward only, per approved analysis).

alter table public.invoice_lines
  add column if not exists pack_price numeric(12,2),
  add column if not exists units_per_pack integer not null default 1;
