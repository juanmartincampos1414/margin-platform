-- Sprint 1: Invoice Intelligence + Supplier Intelligence
-- Adds suppliers, ingredient_aliases, price_history; reshapes invoices/invoice_items/ingredients
-- to match Build Spec V1 (table names, statuses, fields).

-- =====================
-- SUPPLIERS
-- =====================
create table public.suppliers (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  name text not null,
  tax_id text,
  phone text,
  email text,
  payment_terms text,
  credit_days integer default 0,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (restaurant_id, tax_id)
);

create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.handle_updated_at();

-- =====================
-- INVOICES: align statuses + link supplier
-- =====================
alter table public.invoices
  add column if not exists supplier_id uuid references public.suppliers,
  add column if not exists due_date date;

alter table public.invoices drop constraint if exists invoices_status_check;

-- map old values to the new 5-state spec before tightening the constraint
update public.invoices set status = 'uploaded' where status not in ('processing', 'processed', 'error', 'reviewed');
update public.invoices set status = 'review_required' where status = 'reviewed';
update public.invoices set status = 'failed' where status = 'error';

alter table public.invoices add constraint invoices_status_check
  check (status in ('uploaded', 'processing', 'processed', 'review_required', 'failed'));
alter table public.invoices alter column status set default 'uploaded';

-- =====================
-- INVOICE_LINES (renamed from invoice_items)
-- =====================
alter table public.invoice_items rename to invoice_lines;
alter table public.invoice_lines rename column product_name to ingredient_name;
alter table public.invoice_lines rename column subtotal to total_price;

-- =====================
-- INGREDIENTS: normalization + supplier + lifecycle
-- =====================
alter table public.ingredients rename column price_per_unit to current_price;
alter table public.ingredients
  add column if not exists normalized_name text,
  add column if not exists supplier_id uuid references public.suppliers,
  add column if not exists status text not null default 'draft' check (status in ('draft', 'validated', 'merged', 'archived')),
  add column if not exists merged_into_id uuid references public.ingredients;

update public.ingredients set normalized_name = upper(trim(name)) where normalized_name is null;

-- =====================
-- INGREDIENT_ALIASES (raw OCR text variants seen per ingredient)
-- =====================
create table public.ingredient_aliases (
  id uuid primary key default uuid_generate_v4(),
  ingredient_id uuid references public.ingredients on delete cascade,
  raw_text text not null,
  created_at timestamptz default now()
);

-- =====================
-- PRICE_HISTORY (append-only)
-- =====================
create table public.price_history (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  ingredient_id uuid references public.ingredients on delete cascade,
  supplier_id uuid references public.suppliers,
  invoice_id uuid references public.invoices,
  price numeric(12,2) not null,
  unit text not null,
  recorded_at timestamptz default now()
);

-- =====================
-- RLS
-- =====================
alter table public.suppliers enable row level security;
alter table public.ingredient_aliases enable row level security;
alter table public.price_history enable row level security;

create policy "Tenant isolation - suppliers" on public.suppliers
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - ingredient_aliases" on public.ingredient_aliases
  for all using (
    ingredient_id in (select id from public.ingredients where restaurant_id = public.get_my_restaurant_id())
  );

create policy "Tenant isolation - price_history" on public.price_history
  for all using (restaurant_id = public.get_my_restaurant_id());
