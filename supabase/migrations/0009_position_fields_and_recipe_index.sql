-- Sprint 05.5: position/sort_order columns added now (while these tables
-- are small and recently created) to avoid a harder backfill later, when
-- drag-and-drop UI is actually built. No UI uses these yet.

alter table public.menu_categories add column if not exists position integer;
alter table public.menu_items add column if not exists position integer;
alter table public.recipe_ingredients add column if not exists position integer;

-- Backfill deterministically by current alphabetical/creation order so
-- nothing appears unordered once a UI starts reading `position`.
with ranked as (
  select id, row_number() over (partition by restaurant_id order by name) - 1 as rn
  from public.menu_categories
)
update public.menu_categories mc
set position = ranked.rn
from ranked
where mc.id = ranked.id;

-- menu_items.position is scoped per category (not a global menu order) —
-- the position of "Milanesa" within Principales is independent of the
-- position of "Empanadas" within Entradas.
with ranked as (
  select id, row_number() over (partition by restaurant_id, category_id order by name) - 1 as rn
  from public.menu_items
)
update public.menu_items mi
set position = ranked.rn
from ranked
where mi.id = ranked.id;

with ranked as (
  select id, row_number() over (partition by recipe_id order by created_at) - 1 as rn
  from public.recipe_ingredients
)
update public.recipe_ingredients ri
set position = ranked.rn
from ranked
where ri.id = ranked.id;

-- Sprint 05.5 bridges Menu Items to Recipes via recipe_id — this join will
-- run on every Menu Intelligence page load once profitability metrics are
-- displayed, so it needs an index.
create index if not exists idx_menu_items_recipe_id on public.menu_items (recipe_id);
