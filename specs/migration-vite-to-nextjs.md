# Migration: Vite SPA → Next.js 15 App Router

**Branch:** `001-meal-planner-nextj-migrate`  
**Commit:** `08c9e47`  
**Date:** 2026-05-31  
**Scope:** `packages/client` only — server and agent are unchanged

---

## 1. Motivation

Learning-driven migration to Next.js 15. The phased approach kept the application functional at every step, with no regressions in feature behaviour or test coverage.

---

## 2. Migration Phases

### Phase 1 — Install Next.js alongside Vite

- Added `next@^15` to `packages/client/dependencies`
- Created `next.config.ts` with `output: 'standalone'` for Docker
- Created `next-env.d.ts`
- Left `vite.config.ts` in place temporarily

### Phase 2 — App Router scaffold

Created the `app/` directory at `packages/client/app/`:

| File | Purpose |
|------|---------|
| `app/layout.tsx` | Root layout — sets `<html lang>`, imports global CSS, wraps with `<Providers>` and `<Nav>` |
| `app/page.tsx` | `/` route — renders `<InventoryPage>` |
| `app/calendar/page.tsx` | `/calendar` route — renders `<CalendarPage>` |
| `app/grocery/page.tsx` | `/grocery` route — renders `<GroceryListPage>` |
| `app/providers.tsx` | `'use client'` wrapper that mounts all React Context providers |
| `app/nav.tsx` | `'use client'` top navigation bar using `next/link` |

### Phase 3 — Rename and annotate page-level components

- `src/pages/` renamed to `src/views/` (Next.js reserves `pages/` for Pages Router)
- `src/App.tsx` → `src/views/InventoryPage.tsx` (providers and header extracted to `app/layout.tsx` and `app/nav.tsx`)
- `src/main.tsx` removed (no longer needed; Next.js manages the React root)
- Added `'use client'` directive to:
  - `src/views/InventoryPage.tsx`
  - `src/views/CalendarPage.tsx`
  - `src/views/GroceryListPage.tsx`
  - `src/context/GroceryListContext.tsx`
  - `app/providers.tsx`
  - `app/nav.tsx`

### Phase 4 — Remove Vite build infrastructure

- Deleted `vite.config.ts`
- Created `vitest.config.ts` (Vitest runs independently of Next.js build — no Vite needed)
- Updated `package.json` scripts:

  | Script | Before | After |
  |--------|--------|-------|
  | `dev` | `vite --port 5173` | `next dev --port 3000` |
  | `build` | `tsc && vite build` | `next build` |
  | `start` | *(none)* | `next start --port 3000` |

### Phase 5 — Docker and CORS updates

- Removed Nginx `Dockerfile` and `nginx.conf` from the client package
- `packages/client/Dockerfile` updated to use Next.js standalone server
- `docker-compose.yml`:
  - Client port mapping changed from `5173:80` → `3000:3000`
  - `CORS_ORIGIN` updated from `http://localhost:5173` → `http://localhost:3000`
- Root `.env` and `.env.example` updated: `CORS_ORIGIN=http://localhost:3000`

### Phase 6 — Tests and lint cleanup

- `tests/App.test.tsx` renamed to `tests/InventoryPage.test.tsx` (mirrors component rename)
- `tests/app/nav.test.tsx` added (covers `<Nav>` active-link rendering)
- `tests/setup.ts` extended:
  - Mocks `next/navigation` (`useRouter`, `usePathname`)
  - Mocks `next/link` (renders as plain `<a>` in jsdom)
- Pre-existing lint complexity violations fixed along the way:
  - `GroceryListPage` — extracted `<GroceryListContent>` to reduce cyclomatic complexity
  - `grocery-lists.ts` PATCH handler — extracted `buildItemSetFields`
  - `ingredient-matcher.ts` `stemWord` — extracted `stripEsSuffix` + `endsWithPlainS`
  - `RecommendationsPanel.tsx` — removed orphaned `eslint-disable` comment

---

## 3. File Inventory After Migration

### New files
```
packages/client/app/layout.tsx
packages/client/app/page.tsx
packages/client/app/calendar/page.tsx
packages/client/app/grocery/page.tsx
packages/client/app/providers.tsx
packages/client/app/nav.tsx
packages/client/next.config.ts
packages/client/next-env.d.ts
packages/client/vitest.config.ts
packages/client/tests/app/nav.test.tsx
packages/client/src/views/InventoryPage.tsx
packages/client/src/views/CalendarPage.tsx   (moved from src/pages/)
packages/client/src/views/GroceryListPage.tsx (moved from src/pages/)
```

### Deleted files
```
packages/client/vite.config.ts
packages/client/src/App.tsx
packages/client/src/main.tsx
packages/client/src/pages/CalendarPage.tsx
packages/client/src/pages/GroceryListPage.tsx
packages/client/nginx.conf              (if present)
packages/client/tests/App.test.tsx
```

---

## 4. Key Architectural Decisions

### `'use client'` boundary

Next.js App Router defaults to React Server Components. All view and context files that use hooks (`useState`, `useEffect`, `useContext`, drag-and-drop, etc.) must declare `'use client'`. The `app/providers.tsx` wrapper is the coarsest safe boundary for the context tree; individual view components are also marked to allow direct use from route pages.

### `src/views/` naming

Next.js treats any `pages/` directory as a Pages Router entrypoint. Naming the view layer `views/` avoids accidental Pages Router activation while keeping a clear separation between route files (`app/`) and page-level component logic (`src/views/`).

### Vitest decoupled from build

Vitest runs via `vitest.config.ts` independently of Next.js. This keeps test runs fast and avoids the `@vitejs/plugin-react` dependency from entangling with the Next.js build pipeline.

### Standalone output for Docker

`next.config.ts` sets `output: 'standalone'` so `next build` produces a self-contained Node.js server bundle, replacing the previous Nginx static-file server. The Docker port is 3000 matching `next start --port 3000`.

---

## 5. Not Changed

- `packages/server/` — Express API is unaffected
- `agents/meal-recommender/` — Holodeck agent is unaffected
- All server tests (Jest) — unaffected
- All client component logic — no behaviour changes, only structural moves
- TypeScript strict-mode settings — unchanged
- ESLint and Prettier configuration — unchanged

---

## 6. Running the Migrated Client

```bash
# Development (hot reload)
npm run client                    # next dev --port 3000

# Full stack
npm run dev                       # client (3000) + server (3001) concurrently

# Docker
docker compose up --build         # includes Next.js standalone server on port 3000

# Tests
npm -w packages/client run test   # Vitest
```
