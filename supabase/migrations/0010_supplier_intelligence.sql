-- Sprint 06: Supplier Intelligence
-- Per blueprint review: no supplier_price_history table — price_history
-- (Sprint 1) is already the single source of truth for supplier price
-- data (supplier_id, ingredient_id, price, recorded_at, joined to
-- invoices for invoice_date). Only two genuinely new tables are needed:
-- a cached metrics snapshot (expensive to compute live) and a stateful
-- opportunities lifecycle (open/reviewed/dismissed, not derivable).

-- =====================
-- SUPPLIER METRICS (cached — recomputed synchronously when an invoice
-- for that supplier is processed, not computed live on every page load)
-- =====================
create table public.supplier_metrics (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  supplier_id uuid references public.suppliers on delete cascade,
  health_score numeric(5,2),
  risk_level text check (risk_level in ('low', 'medium', 'high')),
  monthly_variation_pct numeric(6,2),
  updated_at timestamptz default now(),
  unique (supplier_id)
);

-- =====================
-- SUPPLIER OPPORTUNITIES
-- Designed as the Procurement bridge: Sprint 06 detects opportunities,
-- a future Procurement sprint converts them into purchase actions.
-- Fields like reviewed_at/dismissed_at and the converted_to_purchase_action
-- status are here now so Procurement never requires a schema migration.
-- =====================
create table public.supplier_opportunities (
  id uuid primary key default uuid_generate_v4(),
  restaurant_id uuid references public.restaurants on delete cascade,
  supplier_id uuid references public.suppliers on delete cascade,
  ingredient_id uuid references public.ingredients on delete cascade,
  title text not null,
  description text,
  opportunity_type text not null default 'price_increase'
    check (opportunity_type in ('price_increase', 'volatility', 'inactivity')),
  priority text not null default 'medium'
    check (priority in ('high', 'medium', 'low')),
  price_change_pct numeric(6,2),
  impact_value numeric(12,2),
  status text not null default 'open'
    check (status in ('open', 'reviewed', 'dismissed', 'converted_to_purchase_action')),
  reviewed_at timestamptz,
  dismissed_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (supplier_id, ingredient_id, status)
);

-- =====================
-- RLS
-- =====================
alter table public.supplier_metrics enable row level security;
alter table public.supplier_opportunities enable row level security;

create policy "Tenant isolation - supplier_metrics" on public.supplier_metrics
  for all using (restaurant_id = public.get_my_restaurant_id());

create policy "Tenant isolation - supplier_opportunities" on public.supplier_opportunities
  for all using (restaurant_id = public.get_my_restaurant_id());
