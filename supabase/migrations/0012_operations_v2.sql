-- Sprint 06.5 v2: Operations Import — Executive KPI contract
-- Replaces full product_mix extraction with an Executive Summary per day.
-- Motivation: full product_mix caused JSON truncation on large PDFs (300+ lines).
-- New KPIs surfaced: transactions, avg_cover, salon/delivery split, cortesías,
-- credit notes, cancellations — all operationally relevant for Executive Intelligence.

alter table public.daily_operations
  add column if not exists transactions         integer,
  add column if not exists avg_cover            numeric(12,2),
  add column if not exists salon_sales          numeric(12,2),
  add column if not exists delivery_sales       numeric(12,2),
  add column if not exists complimentary_amount numeric(12,2),
  add column if not exists credit_notes_amount  numeric(12,2),
  add column if not exists cancellations_amount numeric(12,2);

comment on column public.daily_operations.transactions         is 'Cantidad de tickets/comandas del día';
comment on column public.daily_operations.avg_cover           is 'Ticket promedio por cubierto (total_revenue / total_covers)';
comment on column public.daily_operations.salon_sales         is 'Ventas salón (excluye delivery)';
comment on column public.daily_operations.delivery_sales      is 'Ventas delivery / take-away';
comment on column public.daily_operations.complimentary_amount is 'Invitaciones y cortesías del día — señal operativa clave';
comment on column public.daily_operations.credit_notes_amount  is 'Notas de crédito emitidas';
comment on column public.daily_operations.cancellations_amount is 'Anulaciones del día';
