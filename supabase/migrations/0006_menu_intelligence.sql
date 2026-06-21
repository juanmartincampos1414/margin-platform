-- Sprint 05: Menu Intelligence (per Sprint_05_Menu_Intelligence.docx)
-- menu_categories, menu_imports, menu_items. Independent module — does not
-- touch Invoice Intelligence or Product Intelligence. Recipes are never
-- auto-created or auto-linked; recipe_id starts null ("Recipe Missing").

-- =====================
-- MENU_CATEGORIES
-- =====================
create table public.menu_categories (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  name text not null,
  created_at timestamptz default now()
);

-- =====================
-- MENU_IMPORTS
-- =====================
create table public.menu_imports (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  file_name text,
  file_type text,
  -- not in the spec's literal schema, but required to actually fetch and
  -- parse the uploaded file in the /parse step.
  file_url text,
  status text not null default 'uploaded' check (status in ('uploaded', 'processing', 'completed', 'failed')),
  created_at timestamptz default now()
);

-- =====================
-- MENU_ITEMS
-- =====================
create table public.menu_items (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  category_id uuid references public.menu_categories,
  menu_import_id uuid references public.menu_imports,
  name text not null,
  -- used for duplicate detection (FR-033) — never shown to the user.
  normalized_name text,
  selling_price numeric(12,2) not null default 0,
  -- "Recipe Missing" when null, "Recipe Connected" once set — always a
  -- manual user action (FR-031), never populated during parsing.
  recipe_id uuid references public.recipes,
  status text not null default 'pending_review' check (status in ('pending_review', 'active', 'archived')),
  created_at timestamptz default now()
);

-- =====================
-- RLS
-- =====================
alter table public.menu_categories enable row level security;
alter table public.menu_imports enable row level security;
alter table public.menu_items enable row level security;

create policy "Tenant isolation - menu_categories" on public.menu_categories
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - menu_imports" on public.menu_imports
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - menu_items" on public.menu_items
  for all using (restaurant_id = public.get_my_restaurant_id());
