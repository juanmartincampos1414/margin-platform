-- Recipe Import Onboarding: menu item matching columns.
-- matched_menu_item_id: the menu_items row that best matches the imported recipe name.
-- menu_match_confidence: 0-100 score of how confident the match is.
-- Both are set during processing and displayed in the review UI so the user
-- can accept, change, or skip the auto-link before confirming.

alter table public.recipe_import_items
  add column if not exists matched_menu_item_id uuid references public.menu_items,
  add column if not exists menu_match_confidence numeric(5,2);
