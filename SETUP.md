# Margin Platform — Setup

## 1. Crear proyecto en Supabase
1. Ir a https://supabase.com → New project
2. Copiar las keys en `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

## 2. Ejecutar el schema SQL
En Supabase → SQL Editor, pegar y ejecutar el contenido de `supabase/schema.sql`.

## 3. Crear el bucket de Storage
En Supabase → Storage → New bucket → nombre: `invoices` → Public: ON

## 4. Anthropic API Key
- Ir a https://console.anthropic.com → API Keys
- Agregar `ANTHROPIC_API_KEY` en `.env.local`

## 5. Crear primer admin
1. Registrarse normalmente en /registro
2. En Supabase → Table Editor → profiles → editar el registro → role = 'admin'

## 6. Correr en desarrollo
```bash
npm run dev
```
→ http://localhost:3000

## Estructura de rutas
- `/` — Landing page
- `/login` — Login por restaurante
- `/registro` — Registro con nombre de restaurante
- `/dashboard` — Panel principal con KPIs
- `/recetas` — Lista de platos con márgenes
- `/recetas/nueva` — Crear receta con ingredientes
- `/recetas/[id]` — Detalle de plato + análisis IA
- `/ingredientes` — CRUD de ingredientes y precios
- `/facturas` — Historial de facturas procesadas
- `/facturas/subir` — Subir factura con OCR IA
- `/analisis` — Ranking de márgenes de toda la carta
- `/admin` — Panel administrador (requiere role=admin)
- `/admin/restaurantes/[id]` — Gestión de restaurante individual
