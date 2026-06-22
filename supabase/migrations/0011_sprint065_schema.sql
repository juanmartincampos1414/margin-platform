-- Sprint 06.5: Operations Import Intelligence
-- Incorporates 4 additional product considerations:
--   1. Labor Intelligence prep (daily_operations.labor_cost placeholder)
--   2. Recipe source tracking (recipes.source_type)
--   3. OCR Learning Layer (ocr_corrections table)
--   4. Full product vision alignment: Invoices → Ingredients → Recipes → Menu
--      → Suppliers → Operations → Labor → P&L → Procurement → AI Agents

-- ─── 1. Recipes: source tracking ───────────────────────────────────────────
-- Allows measuring adoption and data origin (manual vs OCR vs import).
alter table public.recipes
  add column if not exists source_type text not null default 'manual'
    check (source_type in ('manual', 'ocr', 'pdf', 'excel', 'csv', 'image'));

-- ─── 2. Suppliers: Procurement-ready contact fields ────────────────────────
-- phone and email already exist. Adding the rest for full contact profile
-- and future automated outreach (Sprint Procurement).
alter table public.suppliers
  add column if not exists whatsapp text,
  add column if not exists instagram text,
  add column if not exists website text,
  add column if not exists contact_name text,
  add column if not exists notes text;

-- ─── 3. Invoices: allow soft-delete ────────────────────────────────────────
-- 'deleted' lets users remove failed/noise invoices without losing the record.
-- Hard Rule 5: never hard-delete, only change status.
alter table public.invoices
  drop constraint if exists invoices_status_check;
alter table public.invoices
  add constraint invoices_status_check
  check (status in ('uploaded', 'processing', 'processed', 'review_required', 'failed', 'deleted'));

-- ─── 4. Recipe Import tables ────────────────────────────────────────────────
create table if not exists public.recipe_imports (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  file_name text not null,
  file_url text not null,
  source_type text not null default 'image'
    check (source_type in ('pdf', 'excel', 'csv', 'image')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'review_required', 'confirmed', 'failed')),
  ocr_confidence numeric(5,2),
  extracted_data jsonb,
  imported_recipe_count integer default 0,
  created_at timestamptz default now(),
  processed_at timestamptz
);

-- Candidate recipes extracted by OCR — held here until the user reviews and confirms.
create table if not exists public.recipe_import_items (
  id uuid primary key default uuid_generate_v4(),
  import_id uuid references public.recipe_imports on delete cascade,
  restaurant_id uuid references public.restaurants on delete cascade,
  proposed_name text not null,
  proposed_sale_price numeric(12,2),
  proposed_portions integer default 1,
  confidence numeric(5,2),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'rejected', 'merged')),
  -- matched_recipe_id: set when OCR detects a name that closely matches an existing recipe.
  -- The user decides whether to merge or create separately.
  matched_recipe_id uuid references public.recipes,
  -- created_recipe_id: set after confirmation materializes the recipe.
  created_recipe_id uuid references public.recipes,
  -- JSONB array: [{name, quantity, unit, matched_ingredient_id, confidence, corrected}]
  -- 'corrected' flag written when user edits — feeds ocr_corrections.
  raw_ingredients jsonb,
  created_at timestamptz default now()
);

-- ─── 5. Operations Import tables ────────────────────────────────────────────
-- Designed to become the P&L base: Revenue + COGS + Labor Cost.
-- labor_cost is nullable today; Sprint 07 Labor Intelligence will populate it.
-- When filled: P&L = total_revenue - cogs_amount - labor_cost (per day).
create table if not exists public.operations_imports (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  file_name text not null,
  file_url text not null,
  source_type text not null default 'image'
    check (source_type in ('pos_report', 'cash_register', 'excel', 'pdf', 'image')),
  status text not null default 'uploaded'
    check (status in ('uploaded', 'processing', 'review_required', 'confirmed', 'failed')),
  ocr_confidence numeric(5,2),
  extracted_data jsonb,
  period_start date,
  period_end date,
  created_at timestamptz default now(),
  processed_at timestamptz
);

create table if not exists public.daily_operations (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  import_id uuid references public.operations_imports,
  operation_date date not null,
  -- Revenue layer
  total_revenue numeric(12,2),
  total_covers integer,
  avg_ticket numeric(10,2),
  -- Payment mix
  cash_amount numeric(12,2),
  card_amount numeric(12,2),
  transfer_amount numeric(12,2),
  other_payment_amount numeric(12,2),
  -- Service breakdown (supports lunch/dinner split in future)
  lunch_covers integer,
  dinner_covers integer,
  -- COGS layer (calculated from product_mix × recipe costs)
  cogs_amount numeric(12,2),
  -- Labor cost placeholder — null until Sprint 07.
  -- P&L formula when complete: total_revenue - cogs_amount - labor_cost = gross_profit.
  labor_cost numeric(12,2),
  -- Lifecycle: draft (review pending) → confirmed → superseded (re-import replaced this day)
  -- Hard Rule 5: superseded rows are kept for audit, never deleted.
  status text not null default 'draft'
    check (status in ('draft', 'confirmed', 'superseded')),
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Enforces one confirmed row per restaurant+date. Drafts and superseded rows accumulate freely.
create unique index if not exists daily_operations_confirmed_per_day
  on public.daily_operations (restaurant_id, operation_date)
  where status = 'confirmed';

create table if not exists public.daily_product_mix (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  operation_id uuid references public.daily_operations on delete cascade,
  -- Nullable: OCR may not match all items to a menu_item. Unmatched stay as item_name text.
  menu_item_id uuid references public.menu_items,
  item_name text not null,
  quantity_sold integer,
  unit_revenue numeric(12,2),
  total_revenue numeric(12,2),
  created_at timestamptz default now()
);

-- ─── 6. OCR Learning Layer ──────────────────────────────────────────────────
-- Captures every user correction across Invoice, Recipe Import, and Operations Import.
-- No business logic reads from this table in Sprint 06.5 — it is a dataset
-- for future AI agents and automated suggestions (Sprint AI Agents).
-- correction_type covers all editable fields across all import modules.
create table if not exists public.ocr_corrections (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  correction_type text not null
    check (correction_type in (
      'ingredient_name', 'quantity', 'unit', 'recipe_name',
      'ingredient_match', 'product_mix_match', 'sale_price',
      'covers', 'revenue', 'payment_split'
    )),
  source_module text not null
    check (source_module in ('invoice', 'recipe_import', 'operations_import')),
  -- Flexible UUID — points to the import row (recipe_imports.id, operations_imports.id,
  -- or invoices.id). No FK enforced to stay agnostic of which table it points to.
  import_id uuid,
  original_value text,
  corrected_value text,
  -- Entity IDs the OCR picked vs what the user chose (for matching corrections).
  original_match_id uuid,
  corrected_match_id uuid,
  created_at timestamptz default now()
);

-- ─── RLS ────────────────────────────────────────────────────────────────────
alter table public.recipe_imports enable row level security;
create policy "restaurant_isolation" on public.recipe_imports
  using (restaurant_id = get_my_restaurant_id());

alter table public.recipe_import_items enable row level security;
create policy "restaurant_isolation" on public.recipe_import_items
  using (restaurant_id = get_my_restaurant_id());

alter table public.operations_imports enable row level security;
create policy "restaurant_isolation" on public.operations_imports
  using (restaurant_id = get_my_restaurant_id());

alter table public.daily_operations enable row level security;
create policy "restaurant_isolation" on public.daily_operations
  using (restaurant_id = get_my_restaurant_id());

alter table public.daily_product_mix enable row level security;
create policy "restaurant_isolation" on public.daily_product_mix
  using (restaurant_id = get_my_restaurant_id());

alter table public.ocr_corrections enable row level security;
create policy "restaurant_isolation" on public.ocr_corrections
  using (restaurant_id = get_my_restaurant_id());
