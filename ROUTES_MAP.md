# Margin — Routes Map

## Page Routes (Next.js App Router, `src/app/`)

| Route | File | Auth | Notes |
|---|---|---|---|
| `/` | `app/page.tsx` | Public | Landing page |
| `/login` | `app/login/page.tsx` | Public (redirects away if logged in) | Email/password via Supabase Auth |
| `/registro` | `app/registro/page.tsx` | Public (redirects away if logged in) | Sign up → creates `auth.users` row → calls `/api/auth/setup` to create restaurant + link profile |
| `/dashboard` | `app/dashboard/page.tsx` | Required | **Not under the `(app)` route group** — duplicates Sidebar/auth logic that `(app)/layout.tsx` already provides for every other authenticated page. See Technical Debt. |
| `/recetas` | `app/(app)/recetas/page.tsx` | Required (via `(app)` layout) | List + cost/margin per recipe |
| `/recetas/nueva` | `app/(app)/recetas/nueva/page.tsx` | Required | Create recipe |
| `/recetas/[id]` | `app/(app)/recetas/[id]/page.tsx` | Required | Recipe detail, cost breakdown, AI Copilot panel |
| `/recetas/[id]/editar` | `app/(app)/recetas/[id]/editar/page.tsx` | Required | Edit recipe |
| `/ingredientes` | `app/(app)/ingredientes/page.tsx` | Required | Ingredient Master list, inline create/edit/delete |
| `/facturas` | `app/(app)/facturas/page.tsx` | Required | Invoice list with 5-state status badges |
| `/facturas/subir` | `app/(app)/facturas/subir/page.tsx` | Required | Upload + OCR-process flow |
| `/facturas/[id]` | `app/(app)/facturas/[id]/page.tsx` | Required | Invoice detail, line items, review-required banner |
| `/proveedores` | `app/(app)/proveedores/page.tsx` | Required | Supplier list with spend/invoice/ingredient counts |
| `/proveedores/[id]` | `app/(app)/proveedores/[id]/page.tsx` | Required | Supplier dashboard: spend, price evolution chart, ingredient catalog, purchase history |
| `/analisis` | `app/(app)/analisis/page.tsx` | Required | Margin ranking across active recipes |
| `/admin` | `app/admin/page.tsx` | Required + `role = 'admin'` | Global cross-tenant view (all restaurants) |
| `/admin/restaurantes/[id]` | `app/admin/restaurantes/[id]/page.tsx` | Required + `role = 'admin'` | Per-restaurant admin actions (plan/active toggle) |

**Auth enforcement is duplicated in two places**: `src/middleware.ts` (route-level redirect for `/dashboard`, `/recetas`, `/ingredientes`, `/facturas`, `/analisis`, `/admin`) and again inside each page component (`redirect('/login')` if no user). `/proveedores` is **missing from the middleware matcher list** — it only has page-level protection, which still works, but is an inconsistency worth fixing (see Technical Debt).

## API Routes (`src/app/api/`)

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/auth/setup` | POST | None (service role) | Create restaurant + attach to a freshly-signed-up profile |
| `/api/admin/restaurants/[id]` | PATCH | Session + `role='admin'` | Toggle plan/active for a restaurant |
| `/api/invoices/upload` | POST | None (service role; trusts `restaurantId` from form body) | Store file in Storage, create `invoices` row (`status: 'uploaded'`) |
| `/api/invoices/process` | POST | None (service role; trusts `invoiceId` from body) | Run Claude OCR, upsert supplier/ingredients/aliases/price_history, finalize invoice status |
| `/api/suppliers` | GET, POST | Session (anon client + RLS) | List suppliers w/ computed spend; create supplier manually |
| `/api/suppliers/[id]` | GET, PATCH | Session (anon client + RLS) | Supplier detail incl. avg price variation; edit commercial terms |
| `/api/ingredients` | GET | Session (anon client + RLS) | List ingredients with joined supplier |
| `/api/ingredients/[id]` | PATCH | Session (anon client + RLS) | Edit ingredient fields (used for both manual edits and review-required fixes) |
| `/api/ai/recommendations` | POST | None (no auth check at all) | Generate AI recommendations for a recipe via Claude — **stateless, doesn't persist to `ai_recommendations`** |

**No DELETE endpoint exists anywhere** — the only delete in the app is the client-side `supabase.from('ingredients').delete()` call in `IngredientsClient.tsx`, which is a **hard delete** bypassing the API layer entirely. This directly conflicts with the Historical Integrity principle and is exactly what `Maintenance_01_Ingredient_Delete` (the current top priority) needs to fix.

**Auth inconsistency across API routes**: `/api/suppliers*` and `/api/ingredients*` check the session and scope by `restaurant_id` properly. `/api/invoices/upload`, `/api/invoices/process`, and `/api/ai/recommendations` have **no session check at all** — they trust whatever `restaurantId`/`invoiceId` is passed in the request body, using the service-role client. This was convenient for testing Sprint 1 directly via `curl` (and that's how the production verification was done), but it means any of these three endpoints could currently be called by anyone with the URL, for any restaurant ID. Flagged in Technical Debt Report as a priority-1 risk.
