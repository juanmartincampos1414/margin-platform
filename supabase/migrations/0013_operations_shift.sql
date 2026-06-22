-- Operations Import: add shift field and fix unique constraint.
-- Motivation: restaurants with AM/PM shifts need two confirmed rows per day.
-- The old unique index on (restaurant_id, operation_date) prevented this.

alter table public.daily_operations
  add column if not exists shift text not null default 'manual'
    check (shift in ('am', 'pm', 'full_day', 'manual'));

-- Drop old index that only allowed one confirmed row per day
drop index if exists daily_operations_confirmed_per_day;

-- New index: one confirmed row per (date, shift) — allows AM + PM on same day
create unique index daily_operations_confirmed_per_day_shift
  on public.daily_operations (restaurant_id, operation_date, shift)
  where status = 'confirmed';

-- Mirror shift on operations_imports so we know what was selected at upload time
alter table public.operations_imports
  add column if not exists shift text not null default 'manual'
    check (shift in ('am', 'pm', 'full_day', 'manual'));
