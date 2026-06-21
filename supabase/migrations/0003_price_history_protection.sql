-- Priority 03: enforce price_history as append-only at the database level.
-- No exceptions, including service-role writes — historical price records
-- must never be modified or deleted once recorded.

create or replace function public.prevent_price_history_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'price_history is append-only: % operations are not permitted', tg_op;
end;
$$;

create trigger price_history_no_update
  before update on public.price_history
  for each row execute function public.prevent_price_history_mutation();

create trigger price_history_no_delete
  before delete on public.price_history
  for each row execute function public.prevent_price_history_mutation();
