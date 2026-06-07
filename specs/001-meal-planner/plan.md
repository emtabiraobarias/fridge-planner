# Implementation Plan: Smart Meal Planner with AI-Powered Recommendations

**Branch**: `001-meal-planner` | **Date**: 2026-03-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-meal-planner/spec.md`
**Last Updated**: 2026-04-06

## Status

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 0 — Scaffolding | **Complete** | Monorepo, Docker, ESLint, Prettier, pre-commit hooks |
| Phase 1 — P1: Inventory + AI Recommendations | **Complete** | Full backend CRUD, recommendations, middleware, frontend components wired together; corrected holodeck endpoint, structured JSON response, meal card UI |
| Phase 2 — P2: Weekly Meal Planning Calendar | **Complete** | MealPlan schema + CRUD API, drag-and-drop calendar UI, ingredient consumption, 72 backend + 80 frontend tests passing |
| Phase 3 — P3: Smart Grocery List | **Complete** | GroceryList model, unit normalization, 6 REST endpoints, 6 grocery components, GroceryListContext, checkout → inventory integration |

### Deferred to Phase 2+

| Item | Reason |
|------|--------|
| Full OAuth 2.0/OIDC (CR-001–003) | Replaced with dev auth stub (`X-User-Id` header); not needed for single-household local MVP |
| CI/CD pipeline (GitHub Actions) | Add once test suite is stable and ready to merge to main |
| Redis caching | Not needed at current scale |
| E2E tests | Unit + integration tests provide sufficient confidence for MVP |
| OpenAPI 3.0 spec (CR-013) | Document after API shape stabilizes post-Phase 2 |
| HTTPS enforcement (CR-003) | Infrastructure/proxy concern, not in-app for local dev |

## Summary

Build a full-stack meal planning web application with three priority tiers: (P1) fridge/pantry inventory tracking with AI meal recommendations via a holodeck-agents sidecar, (P2) a drag-and-drop weekly meal planning calendar, and (P3) a smart grocery list with ingredient aggregation and unit normalisation. The AI recommendation component delegates to a holodeck-agents HTTP sidecar service running a YAML-configured Claude Sonnet 4.6 agent, called over REST from the Express backend.

## Technical Context

**Language/Version**: TypeScript 5.x (strict); Node.js 20 LTS (backend); React 18 (frontend)
**Primary Dependencies**: Express 4, Mongoose 8, Next.js 15 (App Router), React 18, Tailwind CSS 3, holodeck-agents (sidecar, Python-based CLI)
**Storage**: MongoDB (primary datastore), Redis (caching — P2+)
**Testing**: Vitest + React Testing Library (frontend), Jest (backend), holodeck built-in evaluation (agent)
**Target Platform**: Web (desktop + mobile), Docker for dev/prod parity
**Project Type**: Monorepo web application (`packages/client` + `packages/server` + `agents/`)
**Performance Goals**: API p95 < 200ms; frontend TTI < 3s on 3G; recommendation response < 5s (acceptable for AI)
**Constraints**: WCAG 2.1 AA; 80% backend coverage; 70% frontend coverage; twelve-factor config; OAuth 2.0/OIDC
**Scale/Scope**: Single-household to small family use; ~100 concurrent users initially

## AI Recommendation Component — holodeck-agents Integration

### Architecture

The AI meal recommendation feature is implemented as a **holodeck-agents sidecar service** — a separate process/container that the Express backend calls over HTTP. This approach:

- Keeps the Node.js codebase free of Python/LLM infrastructure concerns
- Aligns with the twelve-factor "backing services" principle (accessed via config URL)
- Allows the agent to be developed, tested, and scaled independently
- Uses holodeck's built-in evaluation framework for recommendation quality

```
┌──────────────────────┐  POST /agent/meal-recommender/chat  ┌───────────────────────────┐
│  Express API         │ ──────────────────────────────────► │  holodeck serve           │
│  packages/server     │ ◄────────────────────────────────── │  agents/meal-recommender  │
│  :3001               │  { message: "[{...}]", ... }        │  :8001 (REST protocol)    │
└──────────────────────┘                                     └───────────────────────────┘
                                                         │
                                                         ▼
                                                  Claude Sonnet 4.6
```

### Agent Definition

```yaml
# agents/meal-recommender/agent.yaml (abbreviated — see full file for evaluation_steps)
name: meal-recommender
description: AI-powered meal recommendation agent that suggests meals to minimise food waste

model:
  provider: anthropic
  name: claude-sonnet-4-6
  auth_provider: oauth_token
  temperature: 0.5
  max_tokens: 2000

claude:
  max_turns: 15
  setting_sources: []      # explicit: no inheritance from ~/.claude or project settings
  allowed_tools:
    - WebSearch
    - WebFetch

evaluations:
  model:
    provider: azure_openai
    name: ${AZURE_MODEL_NAME}
    endpoint: ${AZURE_OPENAI_ENDPOINT}
    api_key: ${AZURE_OPENAI_API_KEY}
    temperature: 0.0
  metrics:
    - type: geval
      name: ExpiryPrioritisation
      threshold: 0.8
      # Practicality, MissingIngredientMinimization, IngredientVariety,
      # RecipeUrlConformance, JSONOutputIntegrity — defined but currently disabled
```

### Deployment (sidecar)

```bash
# Development
holodeck serve agents/meal-recommender/agent.yaml \
  --protocol rest \
  --host 0.0.0.0 \
  --port 8001

# Docker (added to docker-compose.yml)
holodeck-ai serve /app/agent.yaml --host 0.0.0.0 --protocol rest
```

### HTTP call from Express

```typescript
// packages/server/src/services/meal-recommender.ts
import type { MealRecommendation } from '../types/meal-recommendation.js';

interface HolodeckResponse {
  message: string;          // JSON-serialised MealRecommendation[]
  session_id: string;
  tokens_used: { input: number; output: number };
  execution_time_ms: number;
}

export async function getMealRecommendations(
  ingredients: IngredientInput[],
): Promise<MealRecommendation[]> {
  const res = await fetch(`${process.env.HOLODECK_URL}/agent/meal-recommender/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) throw new Error(`Holodeck error: ${res.status}`);
  const data = (await res.json()) as HolodeckResponse;
  return JSON.parse(data.message) as MealRecommendation[];
}
```

### Environment variables (twelve-factor)

```
HOLODECK_URL=http://localhost:8001       # Express → holodeck sidecar
ANTHROPIC_API_KEY=...                    # holodeck agent → Claude
```

---

## Project Structure

### Documentation (this feature)

```text
specs/001-meal-planner/
├── plan.md              ← this file
├── spec.md              ← feature specification
└── checklists/
    └── requirements.md  ← specification validation checklist
```

### Source Code

```text
fridge-planner/
├── packages/
│   ├── client/                        # React 18 + Next.js 15 (App Router) + TypeScript
│   │   ├── app/                       # App Router
│   │   │   ├── layout.tsx
│   │   │   ├── providers.tsx          # 'use client' context providers mounted at root
│   │   │   ├── nav.tsx                # top-level navigation
│   │   │   ├── page.tsx               # / (inventory + recommendations)
│   │   │   ├── calendar/page.tsx      # /calendar (P2)
│   │   │   └── grocery/page.tsx       # /grocery (P3)
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── inventory/         # Inventory list, add/edit forms
│   │   │   │   ├── recommendations/   # AI recommendation panel
│   │   │   │   ├── calendar/          # Weekly meal planning (P2)
│   │   │   │   ├── grocery/           # Grocery list (P3)
│   │   │   │   └── shared/
│   │   │   ├── views/                 # Page-level view components (migrated from pages/)
│   │   │   ├── services/              # API client (fetch wrappers)
│   │   │   ├── context/               # React Context for state
│   │   │   ├── types/                 # Client-side shared types
│   │   │   └── lib/                   # date-utils etc.
│   │   ├── tests/
│   │   ├── next.config.ts
│   │   └── vitest.config.ts           # test runner, decoupled from the Next.js build
│   │
│   └── server/                        # Express + TypeScript + Mongoose
│       ├── src/
│       │   ├── api/
│       │   │   ├── v1/
│       │   │   │   ├── inventory.ts   # CRUD routes
│       │   │   │   ├── recommendations.ts  # calls holodeck sidecar
│       │   │   │   ├── meals.ts       # meal plan CRUD (P2)
│       │   │   │   └── grocery.ts     # grocery list (P3)
│       │   ├── models/                # Mongoose schemas
│       │   ├── services/
│       │   │   └── meal-recommender.ts  # holodeck HTTP client
│       │   └── index.ts
│       └── tests/
│           ├── unit/
│           └── integration/
│
├── agents/
│   └── meal-recommender/
│       ├── agent.yaml
│       └── instructions/
│           └── system-prompt.md
│
├── package.json                       # workspace root
├── docker-compose.yml                 # mongodb + holodeck + server + client
└── .env.example
```

---

## Implementation Phases

### Phase 0 — Scaffolding & Verification (prerequisite) ✅

- [x] Verify holodeck serve supports Anthropic/Claude (run `legal-assistant` sample locally)
- [x] Scaffold monorepo: `packages/client`, `packages/server`, workspace `package.json`
- [x] Configure ESLint, Prettier, and pre-commit hooks
- [x] Set up `docker-compose.yml` with MongoDB, holodeck sidecar, server, client
- [x] Create `.env.example` with all required environment variables

### Phase 1 — P1: Inventory + AI Recommendations (MVP) ✅

**Backend (TDD)**:
- [x] Mongoose `InventoryItem` schema (name, quantity, unit, category, expiresAt, location)
- [x] Inventory CRUD API (`/api/v1/inventory`) with Zod validation, pagination, filtering
- [x] Expiration tracking — midnight cutoff logic (yellow = expiring-soon, red = expired)
- [x] holodeck agent (`agents/meal-recommender/`) wired to Claude Sonnet 4.6 via Holodeck
- [x] Recommendations endpoint (`POST /api/v1/recommendations`) — calls holodeck sidecar at `POST /agent/meal-recommender/chat`
- [x] Structured `MealRecommendation[]` JSON response (aligned with Phase 2 MealPlan schema)
- [x] `MealRecommendation` type shared between server (`src/types/`) and client (`src/types/`)
- [x] Auth middleware stub (dev: `X-User-Id` header, full OAuth deferred — see Deferred section)
- [x] Backend middleware: CORS, helmet, rate limiting (100/min default, 10/min recommendations), global error handler, graceful shutdown
- [x] 31 backend tests passing, >80% coverage

**Frontend**:
- [x] Inventory list view with expiration colour coding
- [x] Add/edit ingredient form with validation
- [x] AI recommendation panel with structured `MealRecommendation[]` state
- [x] Meal card UI with cuisine badge, prep time, expiring/missing ingredient pills
- [x] Inventory context provider with shared state management
- [x] App.tsx integration with responsive two-column layout
- [x] Frontend tests passing (RecommendationsPanel + MealCard), >70% coverage

#### Future Improvements (Phase 1 follow-up)

- [ ] **Meal recommender agent tuning** (`agents/meal-recommender/agent.yaml`):
  - Tune temperature and max_tokens based on evaluation metric results
  - Expand `ExpiryPrioritisation` and `Practicality` G-Eval test cases for broader coverage

### Phase 2 — P2: Weekly Meal Planning Calendar ✅

**Backend (TDD)**:
- [x] `MealPlan` Mongoose schema (`userId`, `weekStart`, `entries[]` with `slotId`, `date`, `mealType`, `meal`)
- [x] Meal Plans CRUD API (`/api/v1/meal-plans`) — GET by weekStart, POST entry, DELETE entry, PUT (bulk replace)
- [x] Ingredient consumption on meal assignment — non-blocking decrement/delete of matched inventory items (`lib/ingredient-consumption.ts`)
- [x] Compound unique index `(userId, weekStart)` on MealPlan
- [x] 72 backend tests passing, >80% coverage

**Frontend**:
- [x] `WeeklyCalendar` — 7-day × 4-meal-type grid with week navigation
- [x] `CalendarSlot` — dnd-kit droppable with hover highlight
- [x] `CalendarMealCard` — dnd-kit draggable; click opens `MealDetailModal`
- [x] `MealDetailModal` — full recipe detail; have / expiring-soon / need-to-buy sections; keyboard-accessible
- [x] `DraggableMealCard` — wraps `MealCard` for drag from recommendations panel to calendar
- [x] `CalendarPage` — `DndContext` wrapper integrating `WeeklyCalendar` + `RecommendationsPanel`
- [x] `MealPlanContext` — `assignMeal`, `unassignMeal`, `moveMeal`, week-offset navigation
- [x] 80 frontend tests passing, >70% coverage

### Phase 3 — P3: Smart Grocery List ✅

#### Architecture Overview

Implemented as designed. The grocery list feature is built on top of Phases 1 & 2. It reads the week's `MealPlan`, collects `missingIngredients` from each meal entry, normalizes and groups ingredient names, optionally subtracts non-expired inventory, and produces a persisted `GroceryList` document. A separate `GroceryListProvider`/page on the frontend completes the UI.

**Key design constraint:** `MealRecommendation` stores ingredient names only (no quantities). Auto-generated grocery items express quantity as "number of meals needing this ingredient" with unit `"servings"`. Real unit normalization applies when users manually set quantities via FR-030.

#### New Files

**Server:**
- `packages/server/src/types/grocery-list.ts` — `IGroceryListItem`, `IGroceryList`, `GroceryCategory`
- `packages/server/src/lib/unit-normalizer.ts` — pure unit conversion (volume/mass/count/servings)
- `packages/server/src/lib/ingredient-matcher.ts` — pure name normalization + grouping
- `packages/server/src/lib/ingredient-categorizer.ts` — keyword-based category inference
- `packages/server/src/lib/grocery-list-generator.ts` — orchestration: collect → group → subtract → categorize → sort
- `packages/server/src/models/GroceryList.ts` — Mongoose schema (`userId+weekStart` unique index; subdocument `_id: true`)
- `packages/server/src/api/v1/grocery-lists.ts` — REST router (6 endpoints)
- `packages/server/tests/unit/unit-normalizer.test.ts`
- `packages/server/tests/unit/ingredient-matcher.test.ts`
- `packages/server/tests/unit/ingredient-categorizer.test.ts`
- `packages/server/tests/unit/grocery-list-generator.test.ts`
- `packages/server/tests/integration/grocery-lists.test.ts`

**Client:**
- `packages/client/src/types/grocery-list.ts` — client-side type mirrors
- `packages/client/src/services/grocery-lists.ts` — fetch wrappers for all 6 endpoints
- `packages/client/src/context/GroceryListContext.tsx` — consumes `useMealPlan()` for `currentWeekStart`
- `packages/client/src/components/grocery/GroceryListHeader.tsx`
- `packages/client/src/components/grocery/GroceryListSearchBar.tsx`
- `packages/client/src/components/grocery/GroceryListCategoryGroup.tsx`
- `packages/client/src/components/grocery/GroceryListItemRow.tsx`
- `packages/client/src/components/grocery/AddGroceryItemForm.tsx`
- `packages/client/src/components/grocery/CheckoutConfirmModal.tsx`
- `packages/client/src/pages/GroceryListPage.tsx`

**Modified files:**
- `packages/server/src/app.ts` — mount `groceryListsRouter` at `/api/v1/grocery-lists`
- `packages/client/src/App.tsx` — add "Grocery List" tab; wrap `GroceryListPage` in `GroceryListProvider` (inside `MealPlanProvider` scope)

#### API Endpoints

| Method | Path | FR | Description |
|--------|------|----|-------------|
| GET | `/api/v1/grocery-lists/:weekStart` | FR-025 | Fetch list; auto-generates lazily if missing |
| POST | `/api/v1/grocery-lists/:weekStart/generate` | FR-025 | Force-regenerate; preserves manual items |
| POST | `/api/v1/grocery-lists/:weekStart/items` | FR-030 | Add manual item |
| PATCH | `/api/v1/grocery-lists/:weekStart/items/:itemId` | FR-030, FR-031 | Edit item or toggle `isPurchased` |
| DELETE | `/api/v1/grocery-lists/:weekStart/items/:itemId` | FR-030 | Remove item |
| POST | `/api/v1/grocery-lists/:weekStart/complete` | FR-032 | Add purchased items to inventory (partial success) |

Rate limit: default 100/min (no AI call).

#### Data Model

```typescript
// GroceryListItem (subdocument, _id: true)
{
  ingredientName:  string;    // canonical lowercase key for matching
  displayName:     string;    // title-cased original for UI
  quantity:        number;    // count-of-meals when auto-generated
  unit:            string;    // 'servings' when auto-generated; real unit when manually set
  category:        GroceryCategory;
  isPurchased:     boolean;
  isManuallyAdded: boolean;
  sourceMealNames: string[];
  notes:           string;
}

// GroceryList (top-level, unique index: userId+weekStart)
{
  userId:      string;
  weekStart:   Date;
  items:       GroceryListItem[];
  generatedAt: Date | null;
  timestamps:  true;
}
```

#### Generation Algorithm

1. **Collect** `missingIngredients` from all `mealPlan.entries[].meal.missingIngredients`
2. **Normalize & group** names: lowercase → strip leading quantity prefix → simple plural stem → group by canonical key → pick best `displayName` (most words, title-cased)
3. **Quantity** = number of meal entries referencing the ingredient; unit = `"servings"`
4. **Subtract inventory** (optional): canonical name match AND both have real non-`"servings"` units AND same dimension family → apply `netNeeded()`; drop if net ≤ 0
5. **Categorize** via keyword map (Produce/Dairy/Meat/Seafood/Grains/Pantry/Condiments/Frozen/Other)
6. **Sort** by category order, then alphabetically within

#### Unit Normalization

Canonical base units:
- Volume → `ml` (cup × 236.588, tbsp × 14.787, tsp × 4.929, l × 1000, fl oz × 29.574)
- Mass → `g` (kg × 1000, oz × 28.350, lb × 453.592)
- Count → `count` (dozen × 12, piece × 1)
- `servings` — sentinel; never mixed with real units

`canSubtract(unitA, unitB)`: `false` if different dimension families or either is `servings`/`unknown`.

#### Frontend Architecture

- `GroceryListProvider` reads `currentWeekStart` from `useMealPlan()` — no duplicated week state
- Re-fetches when `currentWeekStart` changes (grocery list always matches visible calendar week)
- Must be rendered inside `MealPlanProvider`
- Search/filter is pure client-side `useState` in `GroceryListPage`
- `CheckoutConfirmModal` calls `inventoryRefresh()` from `useInventory()` after `completeSession()` succeeds

#### Implementation Sequence

1. Server types (`grocery-list.ts`)
2. `unit-normalizer.ts` + unit tests
3. `ingredient-matcher.ts` + unit tests
4. `ingredient-categorizer.ts` + unit tests
5. `grocery-list-generator.ts` + unit tests
6. `GroceryList.ts` Mongoose model
7. `grocery-lists.ts` router + mount in `app.ts`
8. Integration tests
9. Client types + service layer
10. `GroceryListContext.tsx` + context tests
11. Grocery components + component tests
12. `GroceryListPage.tsx` + page tests
13. Add Grocery tab in `App.tsx`

---

## Constitution Check

**Twelve-Factor App Compliance**:
- [x] **Codebase**: Single repository, feature branch `001-meal-planner`
- [x] **Dependencies**: All dependencies declared in `package.json` (npm workspaces) and holodeck `agent.yaml`
- [x] **Config**: `HOLODECK_URL`, `ANTHROPIC_API_KEY`, `MONGODB_URI`, `CORS_ORIGIN`, `LOG_LEVEL` via env vars
- [x] **Backing Services**: MongoDB, holodeck sidecar all accessed via config URLs
- [x] **Build/Release/Run**: Next.js build (client, standalone output), tsc (server), holodeck serve (agent) — separated
- [x] **Processes**: Express is stateless; no in-memory state
- [x] **Port Binding**: Client (:3000 dev / :3000 prod standalone), Server (:3001), holodeck (:8001) — all configurable
- [x] **Concurrency**: Horizontally scalable Express processes; holodeck sidecar independent
- [x] **Disposability**: Express SIGTERM/SIGINT handlers; graceful shutdown with mongoose disconnect
- [x] **Dev/Prod Parity**: docker-compose for all backing services in dev
- [x] **Logs**: Structured JSON to stdout/stderr (pino + pino-http for Express)
- [ ] **Admin Processes**: DB migrations and seed scripts as npm scripts (deferred)

**Security Requirements**:
- [x] Auth middleware stub protecting all `/api/v1/` routes (dev: `X-User-Id` header)
- [ ] Full OAuth 2.0/OIDC authentication (deferred to Phase 2+)
- [ ] JWT token validation with signature verification (deferred)
- [ ] RBAC implementation with granular permissions (deferred)
- [x] Rate limiting: 100 req/min default; 10 req/min for recommendations
- [ ] HTTPS enforcement (TLS 1.3 minimum) (infrastructure concern, deferred)
- [x] Security headers configured via helmet (CSP, X-Frame-Options, HSTS, etc.)

**Testing Standards**:
- [x] TDD approach: Tests written before/alongside implementation
- [x] Minimum 80% backend coverage (88.88%), 70% frontend coverage (89.47%)
- [x] Unit tests for business logic (expiration logic, error handler, meal recommender)
- [x] Integration tests for API contracts (inventory CRUD, recommendations)
- [ ] E2E tests for critical user journeys (deferred)
- [x] holodeck evaluation tests for recommendation quality (ExpiryPrioritisation metric active; results in `agents/meal-recommender/results/`)
- [ ] CI/CD pipeline configured to block failing tests (deferred)

**Performance Requirements**:
- [ ] API p95 latency < 200ms (to be benchmarked)
- [ ] Frontend TTI < 3s on 3G (to be benchmarked)
- [x] Responsive design: mobile-first with `md:` breakpoint two-column layout
- [x] WCAG 2.1 AA accessibility: semantic HTML, aria-labels, aria-invalid, proper form labels
- [x] MongoDB indexes on `expiresAt`, `userId` (via Mongoose schema)
- [ ] Redis caching for recommendation results (deferred to Phase 2+)

**API-First Architecture**:
- [ ] OpenAPI 3.0 specification for all endpoints (deferred)
- [x] API versioning: `/api/v1/...`
- [x] RFC 7807 error responses via `problemJson` helper + global error handler
- [x] Rate limiting: 100 req/min default; recommendation endpoint: 10 req/min
- [x] Pagination for inventory list endpoint (page/limit with offset)
- [x] CORS policy configured (configurable origin via `CORS_ORIGIN` env var)

**Code Quality**:
- [x] ESLint + TypeScript ESLint configured (flat config, ESLint 9)
- [x] Prettier configured
- [x] Pre-commit hooks (lint-staged + husky)
- [x] Cyclomatic complexity < 10 enforced via ESLint
- [x] Zero lint warnings — `npm run lint` passes clean
