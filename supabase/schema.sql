-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =====================
-- RESTAURANTS (tenants)
-- =====================
create table public.restaurants (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  owner_email text not null unique,
  logo_url text,
  plan text not null default 'trial' check (plan in ('trial', 'basic', 'pro', 'enterprise')),
  active boolean not null default true,
  settings jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- PROFILES (users linked to restaurants)
-- =====================
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  restaurant_id uuid references public.restaurants on delete cascade,
  full_name text,
  role text not null default 'owner' check (role in ('owner', 'manager', 'staff', 'admin')),
  avatar_url text,
  created_at timestamptz default now()
);

-- =====================
-- CATEGORIES
-- =====================
create table public.categories (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  name text not null,
  color text default '#6366f1',
  created_at timestamptz default now()
);

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

-- =====================
-- INGREDIENTS / PRODUCTS
-- =====================
create table public.ingredients (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  name text not null,
  normalized_name text,
  brand text,
  unit text not null default 'kg' check (unit in ('kg', 'gr', 'lt', 'ml', 'un', 'doc')),
  current_price numeric(12,2) not null default 0,
  current_price_invoice_date date,
  stock_level text default 'medium' check (stock_level in ('high', 'medium', 'low', 'out')),
  category_id uuid references public.categories,
  supplier_id uuid references public.suppliers,
  status text not null default 'draft' check (status in ('draft', 'validated', 'merged', 'archived')),
  merged_into_id uuid references public.ingredients,
  last_updated timestamptz default now(),
  created_at timestamptz default now()
);

-- =====================
-- INGREDIENT ALIASES (raw OCR text variants)
-- =====================
create table public.ingredient_aliases (
  id uuid primary key default uuid_generate_v4(),
  ingredient_id uuid references public.ingredients on delete cascade,
  raw_text text not null,
  created_at timestamptz default now()
);

-- =====================
-- RECIPES
-- =====================
create table public.recipes (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  name text not null,
  description text,
  image_url text,
  category_id uuid references public.categories,
  servings integer not null default 1,
  sale_price numeric(12,2) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive', 'draft')),
  tags text[] default '{}',
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- =====================
-- RECIPE INGREDIENTS (line items)
-- =====================
create table public.recipe_ingredients (
  id uuid primary key default uuid_generate_v4(),
  recipe_id uuid references public.recipes on delete cascade,
  ingredient_id uuid references public.ingredients on delete restrict,
  quantity numeric(10,3) not null,
  unit text not null,
  created_at timestamptz default now()
);

-- =====================
-- MENU CATEGORIES
-- =====================
create table public.menu_categories (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- =====================
-- MENU IMPORTS
-- =====================
create table public.menu_imports (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  file_name text,
  file_type text,
  file_url text,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'completed', 'failed')),
  created_at timestamptz default now()
);

-- =====================
-- MENU ITEMS
-- =====================
create table public.menu_items (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  category_id uuid references public.menu_categories,
  menu_import_id uuid references public.menu_imports,
  name text not null,
  normalized_name text,
  selling_price numeric(12,2) not null default 0,
  recipe_id uuid references public.recipes,
  status text not null default 'pending_review' check (status in ('pending_review', 'active', 'archived')),
  created_at timestamptz default now()
);

-- =====================
-- INVOICES (OCR)
-- =====================
create table public.invoices (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  supplier_id uuid references public.suppliers,
  file_url text not null,
  file_name text,
  supplier_name text,
  supplier_cuit text,
  invoice_number text,
  invoice_date date,
  due_date date,
  total_amount numeric(14,2),
  currency text default 'ARS',
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'processed', 'review_required', 'failed')),
  extracted_data jsonb default '{}',
  ocr_confidence numeric(5,2),
  created_at timestamptz default now(),
  processed_at timestamptz
);

-- =====================
-- INVOICE LINES
-- =====================
create table public.invoice_lines (
  id uuid primary key default uuid_generate_v4(),
  invoice_id uuid references public.invoices on delete cascade,
  ingredient_id uuid references public.ingredients,
  ingredient_name text not null,
  quantity numeric(10,3),
  unit text,
  unit_price numeric(12,2),
  pack_price numeric(12,2),
  units_per_pack integer not null default 1,
  total_price numeric(14,2),
  previous_price numeric(12,2),
  price_change_pct numeric(6,2),
  created_at timestamptz default now()
);

-- =====================
-- PRICE HISTORY (append-only)
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
-- AI RECOMMENDATIONS
-- =====================
create table public.ai_recommendations (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  recipe_id uuid references public.recipes on delete cascade,
  type text not null check (type in ('negotiate_supplier', 'adjust_price', 'review_ingredient', 'menu_mix')),
  title text not null,
  description text not null,
  estimated_impact_pp numeric(6,2),
  priority text default 'medium' check (priority in ('high', 'medium', 'low')),
  status text default 'pending' check (status in ('pending', 'applied', 'dismissed')),
  created_at timestamptz default now()
);

-- =====================
-- SALES LOG (for menu mix analysis)
-- =====================
create table public.sales_log (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  recipe_id uuid references public.recipes on delete cascade,
  quantity integer not null default 1,
  channel text default 'salon' check (channel in ('salon', 'delivery', 'takeaway')),
  sale_date date not null default current_date,
  created_at timestamptz default now()
);

-- =====================
-- RLS POLICIES
-- =====================
alter table public.restaurants enable row level security;
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.suppliers enable row level security;
alter table public.ingredients enable row level security;
alter table public.ingredient_aliases enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.price_history enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.sales_log enable row level security;

-- Profiles: users see their own profile
create policy "Users can view own profile" on public.profiles
  for select using (auth.uid() = id);

create policy "Users can update own profile" on public.profiles
  for update using (auth.uid() = id);

-- Helper function: get restaurant_id for current user
create or replace function public.get_my_restaurant_id()
returns uuid language sql security definer as $$
  select restaurant_id from public.profiles where id = auth.uid()
$$;

-- Restaurant: only own restaurant
create policy "Users see own restaurant" on public.restaurants
  for select using (id = public.get_my_restaurant_id());

create policy "Users update own restaurant" on public.restaurants
  for update using (id = public.get_my_restaurant_id());

-- Generic tenant policy macro for all other tables
create policy "Tenant isolation - categories" on public.categories
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - suppliers" on public.suppliers
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - ingredients" on public.ingredients
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - ingredient_aliases" on public.ingredient_aliases
  for all using (
    ingredient_id in (select id from public.ingredients where restaurant_id = public.get_my_restaurant_id())
  );

create policy "Tenant isolation - recipes" on public.recipes
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - recipe_ingredients" on public.recipe_ingredients
  for all using (
    recipe_id in (select id from public.recipes where restaurant_id = public.get_my_restaurant_id())
  );

create policy "Tenant isolation - invoices" on public.invoices
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - invoice_lines" on public.invoice_lines
  for all using (
    invoice_id in (select id from public.invoices where restaurant_id = public.get_my_restaurant_id())
  );

create policy "Tenant isolation - price_history" on public.price_history
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - ai_recommendations" on public.ai_recommendations
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - sales_log" on public.sales_log
  for all using (restaurant_id = public.get_my_restaurant_id());

-- =====================
-- FUNCTIONS
-- =====================

-- Auto-update updated_at
create or replace function public.handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger recipes_updated_at before update on public.recipes
  for each row execute function public.handle_updated_at();

create trigger restaurants_updated_at before update on public.restaurants
  for each row execute function public.handle_updated_at();

create trigger suppliers_updated_at before update on public.suppliers
  for each row execute function public.handle_updated_at();

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Enforce price_history as append-only at the database level — no exceptions,
-- including service-role writes. Historical price records must never be
-- modified or deleted once recorded.
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

-- Computed: recipe cost
create or replace function public.get_recipe_cost(recipe_uuid uuid)
returns numeric language sql security definer as $$
  select coalesce(sum(
    ri.quantity * i.current_price /
    case
      when ri.unit = 'gr' and i.unit = 'kg' then 1000
      when ri.unit = 'ml' and i.unit = 'lt' then 1000
      else 1
    end
  ), 0)
  from public.recipe_ingredients ri
  join public.ingredients i on i.id = ri.ingredient_id
  where ri.recipe_id = recipe_uuid
$$;
