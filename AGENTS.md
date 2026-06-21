<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Margin — Product & Process Rules (from README_FOR_CLAUDE)

## Mission

Margin helps hospitality businesses understand where money is being won or lost. It transforms invoices, suppliers, products, menus and recipes into economic intelligence. Margin is **not** an ERP, a POS, or an accounting platform — it is an Economic Intelligence Platform for Hospitality.

Every feature must answer at least one of: Where am I losing money? What changed this week? Which products are hurting my margin? Which suppliers require attention? What should I review first? If a feature doesn't improve decision-making, don't prioritize it.

## Product Principles

1. **Economic Intelligence First** — prioritize economic insights over operational complexity.
2. **Automation Before Manual Work** — when a user uploads a document, extract as much as possible automatically.
3. **Time To Value** — minimize onboarding time; get to useful insights fast.
4. **Human Validation** — AI suggests, users validate. Never invent information. When OCR/AI confidence is low, require user review (this is why `ingredients.status` defaults to `draft` and invoices can be `review_required`).
5. **Historical Integrity** — never destroy historical data. Prefer archive/soft-delete over hard delete. `price_history` is append-only by design — this must never change.

## Current Scope

- **Existing modules** (built): Invoice Intelligence, Product Intelligence, Recipe Engine, Margin Intelligence, AI Copilot.
- **Upcoming**: Sprint 05 Menu Intelligence (parse menu files → categories/items/prices; do **not** auto-generate recipes from it), Sprint 06 Supplier Intelligence (health score, price evolution, monthly variation, critical products, opportunity detection — **not** procurement/purchase orders).
- **Build order / priorities**: Maintenance_01_Ingredient_Delete → Sprint_05_Menu_Intelligence → Sprint_06_Supplier_Intelligence. Don't skip ahead.

## Hard Rules

0. Every mutating API route must resolve `restaurant_id` from the authenticated session (via `requireRestaurant()` in `src/lib/auth.ts`), never from a client-supplied body/query param. Service-role/admin Supabase clients bypass RLS — only use them for the specific privileged operation that needs them (e.g. Storage writes), after the session has already been verified.
1. Do not rebuild existing modules — extend them.
2. Do not change Invoice Intelligence unless absolutely necessary.
3. Do not change Product Intelligence unless absolutely necessary.
4. **Before writing any code**, analyze the existing codebase and return: Architecture Map, Database Map, Entity Relationship Map, Files To Modify, Risks, Questions. Only start implementation after the user approves that plan.
5. When requirements are ambiguous: ask, don't assume. When uncertain: stop and ask for clarification rather than guessing.
6. Prefer extending existing systems over creating parallel ones; identify reusable components and dependencies before building.
7. Don't introduce features outside the approved scope for the current sprint/task.

## Success Definition

Margin succeeds when a restaurant can: upload invoices, upload a menu, connect recipes, understand margins, detect supplier risks, and make better economic decisions. Every sprint should move the product closer to that.
