-- Allow marking confirmed daily_operations as voided (test imports, errors, duplicates).
-- Hard Rule 5: never hard-delete. voided rows stay in the table for audit.
-- voided rows are excluded from all KPI queries the same way superseded rows are.

alter table public.daily_operations
  drop constraint if exists daily_operations_status_check;

alter table public.daily_operations
  add constraint daily_operations_status_check
  check (status in ('draft', 'confirmed', 'superseded', 'voided'));
