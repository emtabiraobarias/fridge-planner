# Tasks: Smart Meal Planner with AI-Powered Recommendations

**Input**: Design documents from `/specs/001-meal-planner/`
**Prerequisites**: plan.md ✓, spec.md ✓

**Status key**: `[x]` = completed · `[ ]` = pending/deferred

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no blocking dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

---

## Phase 1: Setup (Scaffolding & Project Infrastructure)

**Purpose**: Monorepo initialization, tooling configuration, and Docker setup

- [x] T001 Scaffold monorepo with npm workspaces (`packages/client`, `packages/server`) and root `package.json`
- [x] T002 Configure TypeScript strict mode for both packages (`tsconfig.json` in each package)
- [x] T003 [P] Configure ESLint flat config (v9) in `eslint.config.js` with TypeScript rules
- [x] T004 [P] Configure Prettier in `.prettierrc` (2-space indent, single quotes, trailing commas, 100-char line width)
- [x] T005 [P] Set up pre-commit hooks with Husky + lint-staged for lint/format on staged `.ts/.tsx/.css` files
- [x] T006 [P] Create `docker-compose.yml` with MongoDB, holodeck sidecar, server, and client services
- [x] T007 [P] Document all environment variables in `.env.example`
- [x] T008 Initialize Next.js 15 App Router client in `packages/client/` (port 3000); add `next.config.ts` and `vitest.config.ts`

---

## Phase 2: Foundational (Core Backend Infrastructure)

**Purpose**: Shared backend infrastructure that all user stories depend on

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T009 Configure Express app in `packages/server/src/app.ts` with CORS, helmet, JSON body parser, and global router mount
- [x] T010 [P] Implement auth middleware stub in `packages/server/src/middleware/auth.ts` (reads `X-User-Id` header, defaults to `'anonymous'`)
- [x] T011 [P] Implement global error handler in `packages/server/src/middleware/error-handler.ts` (RFC 7807 Problem JSON via `lib/errors.ts`)
- [x] T012 [P] Implement rate limiting middleware in `packages/server/src/middleware/rate-limiter.ts` (100 req/min default per client)
- [x] T013 [P] Create `packages/server/src/lib/errors.ts` with `problemJson` helper and typed error classes
- [x] T014 [P] Configure API versioning structure at `/api/v1/` in `packages/server/src/app.ts`
- [x] T015 [P] Configure structured JSON logging to stdout/stderr in `packages/server/src/index.ts`
- [x] T016 Set up `packages/server/src/index.ts` entry point with Mongoose connect, graceful SIGTERM/SIGINT shutdown, and server start
- [ ] T093 Add `GET /health` and `GET /ready` endpoints in `packages/server/src/app.ts` (constitution Principle IX; required for Docker healthchecks and process orchestration)

**Checkpoint**: Foundation ready — user story implementation can begin

---

## Phase 3: User Story 1 — Inventory Tracking + AI Meal Recommendations (Priority: P1) 🎯 MVP

**Goal**: Users can manage fridge/pantry inventory with expiration tracking and receive AI-powered meal recommendations that prioritize soon-to-expire ingredients and exclude expired ones.

**Independent Test**: (1) Add inventory items via form, (2) request meal recommendations, (3) verify expiry color-coding (yellow/red), (4) confirm expired items are excluded from AI input.

### Backend — US1

- [x] T017 [US1] Create `InventoryItem` Mongoose schema in `packages/server/src/models/inventory-item.ts` (name, quantity, unit, category, location, expiresAt, expirationStatus; `pre('save')` and `pre('findOneAndUpdate')` hooks to auto-compute `expirationStatus`)
- [x] T018 [US1] Implement expiration status logic in `packages/server/src/lib/expiration.ts` (midnight cutoff: `expired` = today or earlier, `expiring-soon` = tomorrow, `normal` = 2+ days, `none` = no date)
- [x] T019 [P] [US1] Unit tests for `expiration.ts` in `packages/server/tests/unit/expiration.test.ts`
- [x] T020 [US1] Implement Inventory CRUD API in `packages/server/src/api/v1/inventory.ts` (GET with pagination/filtering by category/status, POST, PUT, DELETE; Zod validation; invalidates recommendations cache on mutation)
- [x] T021 [P] [US1] Integration tests for inventory CRUD in `packages/server/tests/integration/inventory.test.ts` (in-memory MongoDB via `mongodb-memory-server`)
- [x] T022 [P] [US1] Create `MealRecommendation` server type in `packages/server/src/types/meal-recommendation.ts`
- [x] T023 [US1] Implement recommendations cache in `packages/server/src/services/recommendations-cache.ts` (15-min TTL keyed by `userId+ingredients`; `invalidateUser()` on any inventory mutation)
- [x] T024 [US1] Implement Holodeck HTTP client in `packages/server/src/services/meal-recommender.ts` (POST to `HOLODECK_URL/agent/meal-recommender/chat`, parse JSON `message` field as `MealRecommendation[]`)
- [x] T025 [US1] Implement recommendations endpoint in `packages/server/src/api/v1/recommendations.ts` (POST `/api/v1/recommendations`, 10 req/min rate limit, filters out expired items before calling Holodeck)
- [x] T026 [P] [US1] Integration tests for recommendations in `packages/server/tests/integration/recommendations.test.ts` (mock Holodeck HTTP call)
- [x] T027 [US1] Configure Holodeck meal-recommender agent in `agents/meal-recommender/agent.yaml` (Claude Sonnet 4.6, `auth_provider: oauth_token`, temperature 0.5, max_tokens 2000, WebSearch + WebFetch tools, `ExpiryPrioritisation` G-Eval metric at threshold 0.8)
- [x] T028 [US1] Write meal-recommender system prompt in `agents/meal-recommender/instructions/system-prompt.md` (enforce raw JSON only output, prioritize expiring ingredients, approved recipe domains)

### Frontend — US1

- [x] T029 [P] [US1] Create `MealRecommendation` client type in `packages/client/src/types/meal-recommendation.ts`
- [x] T030 [US1] Implement inventory API service wrappers in `packages/client/src/services/inventory.ts` (fetch wrappers for CRUD endpoints)
- [x] T031 [US1] Create `InventoryContext` in `packages/client/src/context/InventoryContext.tsx` with `useInventory()` custom hook
- [x] T032 [P] [US1] Build `InventoryForm` component in `packages/client/src/components/inventory/InventoryForm.tsx` (add/edit form with client-side validation)
- [x] T033 [P] [US1] Build `InventoryList` component in `packages/client/src/components/inventory/InventoryList.tsx` (yellow highlight for expiring-soon, red for expired, disabled interaction on expired items)
- [x] T034 [P] [US1] Build `MealCard` component in `packages/client/src/components/recommendations/MealCard.tsx` (cuisine badge, prep time, expiring-soon pill, missing ingredient pill)
- [x] T035 [US1] Build `RecommendationsPanel` component in `packages/client/src/components/recommendations/RecommendationsPanel.tsx`
- [x] T036 [US1] Create `InventoryPage` view in `packages/client/src/views/InventoryPage.tsx` (responsive two-column layout: inventory left, recommendations right)
- [x] T037 [US1] Wire up App Router entry points: `packages/client/app/layout.tsx`, `providers.tsx`, `nav.tsx`, `page.tsx` (→ `InventoryPage`)
- [x] T038 [P] [US1] Vitest tests for `RecommendationsPanel` and `MealCard` in `packages/client/tests/components/recommendations/`

**Checkpoint**: US1 fully functional — inventory management and AI recommendations work independently

---

## Phase 4: User Story 2 — Weekly Meal Planning Calendar (Priority: P2)

**Goal**: Users can drag and drop meal recommendation cards onto a 7-day × 4-meal-type calendar grid, view full recipe details, rearrange meals between slots, and have the plan persisted across sessions.

**Independent Test**: (1) View weekly calendar with breakfast/lunch/dinner/snack slots, (2) drag a meal card to a slot, (3) verify meal persists on page refresh, (4) remove a meal and confirm slot is cleared.

### Backend — US2

- [x] T039 [US2] Create `MealPlan` Mongoose schema in `packages/server/src/models/meal-plan.ts` (`userId+weekStart` compound unique index, `entries[]` subdocs with `slotId`, `date`, `mealType`, full `MealRecommendation` snapshot; `_id: false` on subdocs)
- [x] T040 [P] [US2] Create `MealPlan` server type in `packages/server/src/types/meal-plan.ts`
- [x] T041 [US2] Implement ingredient consumption logic in `packages/server/src/lib/ingredient-consumption.ts` (non-blocking inventory decrement/delete on meal assignment, matched by name)
- [x] T042 [US2] Implement Meal Plans CRUD API in `packages/server/src/api/v1/meal-plans.ts` (GET by `weekStart`, POST entry, PUT bulk replace, DELETE entry by `slotId`)
- [x] T043 [P] [US2] Integration tests for meal plans in `packages/server/tests/integration/meal-plans.test.ts`
- [x] T044 [P] [US2] Unit tests for ingredient consumption in `packages/server/tests/unit/ingredient-consumption.test.ts` (verify decrement logic edge cases)

### Frontend — US2

- [x] T045 [P] [US2] Create `MealPlan` client type in `packages/client/src/types/meal-plan.ts`
- [x] T046 [US2] Implement meal plans API service in `packages/client/src/services/meal-plans.ts` (fetch wrappers for all meal-plan endpoints)
- [x] T047 [US2] Create `MealPlanContext` in `packages/client/src/context/MealPlanContext.tsx` with `useMealPlan()` hook (`assignMeal`, `unassignMeal`, `moveMeal`, week-offset navigation, `currentWeekStart`)
- [x] T048 [P] [US2] Build `CalendarSlot` component in `packages/client/src/components/calendar/CalendarSlot.tsx` (dnd-kit droppable with hover highlight)
- [x] T049 [P] [US2] Build `CalendarMealCard` component in `packages/client/src/components/calendar/CalendarMealCard.tsx` (dnd-kit draggable; click opens `MealDetailModal`)
- [x] T050 [P] [US2] Build `MealDetailModal` component in `packages/client/src/components/calendar/MealDetailModal.tsx` (full recipe, have/expiring-soon/need-to-buy sections, keyboard-accessible, aria labels)
- [x] T051 [P] [US2] Build `DraggableMealCard` wrapper in `packages/client/src/components/recommendations/DraggableMealCard.tsx` (wraps `MealCard` for drag from recommendations panel to calendar)
- [x] T052 [US2] Build `WeeklyCalendar` component in `packages/client/src/components/calendar/WeeklyCalendar.tsx` (7-day × 4-meal-type grid, prev/next week navigation, planned-vs-empty day indicator)
- [x] T053 [US2] Create `CalendarPage` view in `packages/client/src/views/CalendarPage.tsx` (`DndContext` wrapper integrating `WeeklyCalendar` + `RecommendationsPanel` side panel)
- [x] T054 [US2] Wire up `/calendar` route in `packages/client/app/calendar/page.tsx`
- [x] T055 [P] [US2] Vitest tests for calendar components and `MealPlanContext` in `packages/client/tests/`

**Checkpoint**: US2 fully functional — drag-and-drop calendar works; US1 and US2 both independently testable

---

## Phase 5: User Story 3 — Smart Grocery List with Ingredient Aggregation (Priority: P3)

**Goal**: Users get an auto-generated, categorized grocery list aggregating ingredients across planned meals, with inventory subtraction, manual item editing, search/filter, and checkout-to-inventory flow.

**Independent Test**: (1) Plan 3 meals needing onions, (2) view grocery list showing single aggregated "onions" entry, (3) check off items, (4) confirm checkout adds purchased items to inventory.

### Backend — US3

- [x] T056 [P] [US3] Create grocery list server type in `packages/server/src/types/grocery-list.ts` (`IGroceryListItem`, `IGroceryList`, `GroceryCategory` enum)
- [x] T057 [US3] Implement unit normalizer in `packages/server/src/lib/unit-normalizer.ts` (volume→ml, mass→g, count→count; `canSubtract()` returns false for different dimension families or sentinel `"servings"`)
- [x] T058 [P] [US3] Unit tests for unit normalizer in `packages/server/tests/unit/unit-normalizer.test.ts`
- [x] T059 [US3] Implement ingredient name normalizer in `packages/server/src/lib/ingredient-matcher.ts` (lowercase, strip leading quantity prefix, plural stem, canonical key grouping, best `displayName` selection)
- [x] T060 [P] [US3] Unit tests for ingredient matcher in `packages/server/tests/unit/ingredient-matcher.test.ts`
- [x] T061 [US3] Implement ingredient categorizer in `packages/server/src/lib/ingredient-categorizer.ts` (keyword-map → Produce/Dairy/Meat/Seafood/Grains/Pantry/Condiments/Frozen/Other)
- [x] T062 [P] [US3] Unit tests for ingredient categorizer in `packages/server/tests/unit/ingredient-categorizer.test.ts`
- [x] T063 [US3] Implement grocery list generator in `packages/server/src/lib/grocery-list-generator.ts` (collect `missingIngredients` → normalize/group → subtract non-expired inventory → categorize → sort by category then alphabetically)
- [x] T064 [P] [US3] Unit tests for grocery list generator in `packages/server/tests/unit/grocery-list-generator.test.ts`
- [x] T065 [US3] Create `GroceryList` Mongoose model in `packages/server/src/models/GroceryList.ts` (`userId+weekStart` compound unique index, subdocuments with `_id: true`, `generatedAt` timestamp)
- [x] T066 [US3] Implement grocery lists REST router in `packages/server/src/api/v1/grocery-lists.ts` (6 endpoints: GET lazy-generate, POST force-generate, POST item, PATCH item, DELETE item, POST complete/checkout)
- [x] T067 [US3] Mount grocery list router in `packages/server/src/app.ts` at `/api/v1/grocery-lists`
- [x] T068 [P] [US3] Integration tests for grocery lists in `packages/server/tests/integration/grocery-lists.test.ts`

### Frontend — US3

- [x] T069 [P] [US3] Create grocery list client type in `packages/client/src/types/grocery-list.ts`
- [x] T070 [US3] Implement grocery lists API service in `packages/client/src/services/grocery-lists.ts` (fetch wrappers for all 6 endpoints)
- [x] T071 [US3] Create `GroceryListContext` in `packages/client/src/context/GroceryListContext.tsx` with `useGroceryList()` hook (reads `currentWeekStart` from `useMealPlan()`, re-fetches on week change; must render inside `MealPlanProvider`)
- [x] T072 [P] [US3] Build `GroceryListHeader` component in `packages/client/src/components/grocery/GroceryListHeader.tsx`
- [x] T073 [P] [US3] Build `GroceryListSearchBar` component in `packages/client/src/components/grocery/GroceryListSearchBar.tsx` (client-side filter, no API call)
- [x] T074 [P] [US3] Build `GroceryListCategoryGroup` component in `packages/client/src/components/grocery/GroceryListCategoryGroup.tsx`
- [x] T075 [P] [US3] Build `GroceryListItemRow` component in `packages/client/src/components/grocery/GroceryListItemRow.tsx` (check-off toggle, `isPurchased` visual state)
- [x] T076 [P] [US3] Build `AddGroceryItemForm` component in `packages/client/src/components/grocery/AddGroceryItemForm.tsx`
- [x] T077 [P] [US3] Build `CheckoutConfirmModal` component in `packages/client/src/components/grocery/CheckoutConfirmModal.tsx` (calls `inventoryRefresh()` from `useInventory()` after `completeSession()` succeeds)
- [x] T078 [US3] Create `GroceryListPage` view in `packages/client/src/views/GroceryListPage.tsx` (search/filter via `useState`, wraps with `GroceryListProvider` inside `MealPlanProvider`)
- [x] T079 [US3] Wire up `/grocery` route in `packages/client/app/grocery/page.tsx`
- [x] T080 [P] [US3] Vitest tests for grocery components and `GroceryListContext` in `packages/client/tests/`

**Checkpoint**: All three user stories fully functional and independently testable

---

## Phase 6: Polish & Deferred Cross-Cutting Concerns

**Purpose**: Deferred constitutional requirements, observability, and hardening not needed for local MVP

> **⚠️ ADR Required**: Tasks T081–T085, T092, T094–T097 defer constitution MUST obligations (OAuth/OIDC, RBAC, Redis, PWA, webhooks, CDN, audit logging). Before this project ships to production, each deferral MUST be documented as an Architectural Decision Record (ADR) per the Governance → Amendment Procedure in `constitution.md`. An undocumented deferral is a constitution violation.

- [ ] T081 Implement full OAuth 2.0/OIDC authentication in `packages/server/src/middleware/auth.ts` (replace `X-User-Id` stub; validate JWT with `AUTH_JWKS_URI`; enforce `AUTH_ISSUER` + `AUTH_AUDIENCE` — CR-001, CR-002)
- [ ] T082 [P] Enforce HTTPS/TLS 1.3 minimum at infrastructure/reverse-proxy layer (CR-003)
- [ ] T083 [P] Write OpenAPI 3.0 specification for all `/api/v1/` endpoints (CR-013; defer until API shape stabilizes post-Phase 3)
- [ ] T084 [P] Set up GitHub Actions CI/CD pipeline (lint → test → coverage gates → build) in `.github/workflows/ci.yml`
- [ ] T085 [P] Configure Redis-backed recommendations cache via `REDIS_URL` in `packages/server/src/services/recommendations-cache.ts` (replace in-memory cache)
- [ ] T086 [P] Write E2E tests in `packages/client/tests/e2e/` using Playwright covering: inventory add → recommendations → calendar drag-and-drop → grocery list checkout (constitution Testing MUST)
- [ ] T087 [P] Benchmark API p95 latency and load test at 1000 concurrent users (target: p95 < 200ms under load — CR-008, SC-002; constitution Performance MUST)
- [ ] T088 [P] Benchmark frontend Time to Interactive on 3G (target < 3s — CR-009, SC-007)
- [ ] T089 [P] Expand meal-recommender G-Eval test cases in `agents/meal-recommender/agent.yaml` (tune temperature/max_tokens based on evaluation results; activate disabled metrics)
- [ ] T090 [P] Run WCAG 2.1 AA accessibility audit across all pages and remediate findings (CR-011)
- [ ] T091 [P] Add database seed/migration npm scripts as admin processes (twelve-factor factor XI)
- [ ] T092 [P] Add PWA service worker for offline access to cached meal plans and grocery lists (spec assumption 10)
- [ ] T094 Implement role-based access control (RBAC) with granular permissions in `packages/server/src/middleware/auth.ts` after T081 (OAuth/OIDC) is complete — constitution Security MUST
- [ ] T095 [P] Evaluate and implement webhook support for asynchronous operations (e.g., recommendation-complete event) in `packages/server/src/api/v1/` — constitution API-First MUST; amend constitution with ADR if excluded from product scope
- [ ] T096 [P] Configure CDN for static asset delivery with cache headers (Vercel Edge / CloudFront) — constitution Performance MUST
- [ ] T097 Implement auth event audit logging in `packages/server/src/middleware/auth.ts` (log userId, endpoint, HTTP method, timestamp, and auth outcome on every request — constitution Security MUST: "Audit all authentication and authorization events")

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1 — blocks all user stories
- **Phase 3 (US1)**: Depends on Phase 2 — no dependency on US2/US3
- **Phase 4 (US2)**: Depends on Phase 2; reuses `MealRecommendation` type from US1
- **Phase 5 (US3)**: Depends on Phase 2; reads from `MealPlan` entries produced by US2
- **Phase 6 (Polish)**: Depends on all user stories complete

### User Story Dependencies

- **US1 (P1)**: After Foundational — no other story dependencies
- **US2 (P2)**: After Foundational; `DraggableMealCard` reuses US1 `MealRecommendation` type
- **US3 (P3)**: After Foundational; `grocery-list-generator` reads `mealPlan.entries[].meal.missingIngredients` (US2 data)

### Within Each User Story

- Server types before services before routes
- Lib utilities before orchestrator (`grocery-list-generator` depends on T057, T059, T061)
- Context before views; views before route wiring
- `GroceryListProvider` must be rendered inside `MealPlanProvider`

### Parallel Opportunities

- All [P]-marked tasks within a phase can run concurrently
- US1 backend (T017–T028) and US1 frontend (T029–T038) can proceed in parallel once Phase 2 completes
- US3 lib utilities T057, T059, T061 can all run simultaneously; T063 depends on their completion
- US3 frontend components T072–T077 can all run in parallel after T069 (types) and T071 (context)

---

## Parallel Example: User Story 3

```bash
# Step 1 — launch all lib utilities together (no inter-dependencies):
T057: unit-normalizer.ts + T058: unit tests
T059: ingredient-matcher.ts + T060: unit tests
T061: ingredient-categorizer.ts + T062: unit tests

# Step 2 — after libs complete:
T063: grocery-list-generator.ts + T064: unit tests
T065: GroceryList Mongoose model

# Step 3 — after types (T069), all frontend components in parallel:
T072: GroceryListHeader.tsx
T073: GroceryListSearchBar.tsx
T074: GroceryListCategoryGroup.tsx
T075: GroceryListItemRow.tsx
T076: AddGroceryItemForm.tsx
T077: CheckoutConfirmModal.tsx
```

---

## Implementation Strategy

### MVP Delivered — All Three Priority Tiers Complete

1. ✅ Phase 3 (US1): Inventory + AI Recommendations — core value, food waste reduction
2. ✅ Phase 4 (US2): Weekly Calendar — visual meal planning, drag-and-drop
3. ✅ Phase 5 (US3): Smart Grocery List — end-to-end workflow

### Remaining Work (Phase 6 — Deferred to Post-MVP)

Priority order for Phase 6:
1. **T093** — Health check endpoints (low effort; unblocks Docker orchestration)
2. **T097** — Audit logging (low effort; constitution Security MUST)
3. **T084** — CI/CD pipeline (unblocks safe continuous delivery)
4. **T081** — OAuth 2.0/OIDC (production readiness; T094 RBAC depends on this)
5. **T094** — RBAC (after T081 OAuth complete)
6. **T083** — OpenAPI 3.0 (API consumers / external integrations)
7. **T085** — Redis cache (scale beyond single-node)
8. **T086** — E2E tests (raise confidence ceiling above unit + integration)
9. **T095** — Webhooks (or file ADR scoping them out)
10. **T096** — CDN (infrastructure; coordinate with deployment platform)

---

## Notes

- `[x]` = completed; `[ ]` = pending/deferred
- `[P]` = can run in parallel (operates on different files, no shared state dependency)
- `[US1/US2/US3]` = maps task to specific user story for full traceability
- **TDD sequence** (constitution requirement): for future phases, test tasks MUST be written and run to failure BEFORE the corresponding implementation task starts (Red-Green-Refactor). The `[P]` marker permits parallel execution with other `[P]` tasks, not permission to skip the write-fail step.
- Do NOT manually set `expirationStatus` in `findOneAndUpdate` — the Mongoose `pre('findOneAndUpdate')` hook in `models/inventory-item.ts` manages it automatically
- `GroceryListProvider` must be rendered inside `MealPlanProvider` (reads `currentWeekStart` via `useMealPlan()`)
- Agent auth MUST use `auth_provider: oauth_token` in `agent.yaml` — never `api_key` (reverted in commit `da0f65f`)
- Server import paths must use `.js` extension even for `.ts` source files (`"moduleResolution": "NodeNext"`)
