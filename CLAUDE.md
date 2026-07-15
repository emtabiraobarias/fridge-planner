# Fridge Planner — Claude AI Guide

This file is the primary reference for AI assistants working in this repository. It covers codebase structure, development workflows, conventions, and rules that must be followed.

---

## 1. Repository Overview

**Fridge Planner** is a full-stack TypeScript monorepo for meal planning. Users track fridge inventory (with expiration awareness), receive AI-powered meal suggestions, and assign meals to a drag-and-drop weekly calendar.

**Tech Stack:**
- **Frontend:** React 18 + Next.js 15 (App Router) + Tailwind CSS (port 3000)
- **Backend:** Next.js Route Handlers + Mongoose + MongoDB — served by the **same Next process** (port 3000). Endpoints live in `packages/client/app/api/v1/`; the server layer (models, libs, services, controllers) in `packages/client/src/server/`. **No standalone Express service** (retired in Phase C-bis — see §10/§14).
- **AI Agents:** two Holodeck sidecars — meal-recommender (OpenAI `gpt-4o`, port 8001) + feedback-collector (OpenAI `gpt-4o`, port 8002)
- **Language:** TypeScript (strict mode throughout)
- **Monorepo:** npm workspace (`packages/client`) — the Next app is the whole stack

---

## 2. Commands

Run all commands from the **repo root** unless noted otherwise.

### Development
| Command | Description |
|---------|-------------|
| `npm run dev` | Start the Next.js app (port 3000) — the whole stack |
| `npm run client` | Same as `dev` (the app *is* the client package) |

> Requires MongoDB (`:27017`) and Holodeck (`:8001`) running — `docker compose up -d mongodb holodeck`. The Next process reads `MONGODB_URI` + `HOLODECK_URL` (see `packages/client/.env.local`).

### Quality
| Command | Description |
|---------|-------------|
| `npm run lint` | ESLint on all `packages/*/src` (zero warnings) |
| `npm run format` | Prettier on all TS/TSX/CSS source files |
| `npm test` | Run all tests (client Vitest — includes node-env API tests under `tests/server/`) |

### Per-Package
```bash
npm -w packages/client run test          # all tests (Vitest)
npm -w packages/client run test -- tests/server/inventory.test.ts  # filtered
npm -w packages/client run build         # production build (next build)
```

### End-to-end validation (release gate)
```bash
bash scripts/validate-e2e.sh             # boot prod build + Mongo (+Holodeck) → shared smoke → teardown
bash scripts/validate-e2e.sh --no-agent  # deterministic core only. See docs/smoke-test.md
```

### Docker (full stack)
```bash
docker compose up --build               # MongoDB + Holodeck + Next.js app (serves the API too)
docker compose rm -fs holodeck          # Stop and remove Holodeck 0-=container
docker compose up -d --build holodeck   # Rebuild and restart Holodeck
docker compose ps holodeck              # Verify if Holodeck is healthy
docker compose logs -f holodeck         # Check Holodeck logs
```

---

## 3. Project Structure

```
fridge-planner/
├── packages/
│   └── client/                       # the whole app — UI + API (no separate server package)
│       ├── app/                      # Next.js App Router entrypoint
│       │   ├── layout.tsx            # Root layout (fonts, global providers)
│       │   ├── page.tsx              # / → InventoryPage
│       │   ├── providers.tsx         # Client-side context providers wrapper
│       │   ├── nav.tsx               # Top navigation bar
│       │   ├── calendar/page.tsx     # /calendar route
│       │   ├── grocery/page.tsx      # /grocery route
│       │   └── api/v1/               # ROUTE HANDLERS (the backend): inventory/, grocery-lists/[weekStart]/*,
│       │                             # meal-plans/[weekStart]/*, recommendations/ — thin; call src/server controllers
│       ├── src/
│       │   ├── components/           # calendar/, grocery/, inventory/, recommendations/, shared/
│       │   ├── context/              # InventoryContext, MealPlanContext, RecommendationsContext, GroceryListContext
│       │   ├── views/                # InventoryPage, CalendarPage, GroceryListPage (all 'use client')
│       │   ├── services/             # inventory.ts, meal-plans.ts, grocery-lists.ts (browser API fetch wrappers)
│       │   ├── types/                # meal-plan.ts, meal-recommendation.ts, grocery-list.ts
│       │   ├── lib/                  # date-utils.ts
│       │   └── server/               # SERVER LAYER (Node-only; `import 'server-only'`):
│       │       ├── db.ts             #   globalThis-cached Mongoose connection
│       │       ├── auth.ts           #   authenticate(): OIDC JWT verify (jose) + dev seam (X-User-Id)
│       │       ├── auth-errors.ts    #   AuthError → 401 (mapped by withRoute)
│       │       ├── http.ts           #   ControllerResult + problem() (framework-agnostic)
│       │       ├── route-helpers.ts  #   withRoute() error wrapper + problemResponse()
│       │       ├── rate-limit.ts     #   in-memory fixed-window limiter
│       │       ├── logger.ts         #   framework-neutral structured logger
│       │       ├── controllers/      #   inventory, grocery-lists, meal-plans, recommendations (extracted logic)
│       │       ├── models/           #   inventory-item, meal-plan, grocery-list (Mongoose; hot-reload guarded)
│       │       ├── services/         #   meal-recommender (Holodeck client), recommendations-cache
│       │       ├── lib/              #   expiration, ingredient-consumption, grocery-list-generator,
│       │       │                     #   ingredient-categorizer, ingredient-matcher, unit-normalizer
│       │       └── types/            #   meal-plan, meal-recommendation, grocery-list
│       └── tests/                    # Vitest — components/, context/, lib/, views/, app/, and
│                                     # tests/server/ (node-env API handler + unit tests vs mongodb-memory-server)
│
├── agents/meal-recommender/
│   ├── agent.yaml                # Holodeck config (model, eval metrics, test cases)
│   └── instructions/             # Claude system prompt
│
├── specs/001-meal-planner/       # spec.md, plan.md, checklists/
│   BRANCHING_STRATEGY.md          # Two-impl (Vite + Next.js) branching model — canonical on `main`; READ FOR BRANCH WORK
├── docker-compose.yml
├── .env.example                  # All required env vars documented here
├── constitution.md               # Core principles (source of truth)
├── eslint.config.js              # ESLint flat config (v9)
└── .prettierrc                   # Formatting rules
```

---

## 4. API Endpoints

Base URL: `http://localhost:3000/api/v1` (served by Next.js Route Handlers in the same process — no proxy, no `:3001`)

### Inventory
| Method | Path | Description |
|--------|------|-------------|
| GET | `/inventory` | List items (query: `category`, `status`, `page`, `limit`) |
| POST | `/inventory` | Create item |
| PUT | `/inventory/:id` | Update item |
| DELETE | `/inventory/:id` | Delete item |

### Recommendations
| Method | Path | Description |
|--------|------|-------------|
| POST | `/recommendations` | Get AI meal suggestions (no body required) |

Rate limit: **10 req/min** (vs 100/min for other endpoints)

### Meal Plans
| Method | Path | Description |
|--------|------|-------------|
| GET | `/meal-plans?weekStart=<ISO>` | Fetch weekly plan |
| POST | `/meal-plans/:weekStart/entries` | Add meal entry to slot |
| PUT | `/meal-plans/:weekStart` | Replace full entries array |
| DELETE | `/meal-plans/:weekStart/entries/:slotId` | Remove meal entry |

### Grocery Lists
| Method | Path | Description |
|--------|------|-------------|
| GET | `/grocery-lists/:weekStart` | Fetch list; lazily generates from meal plan if none exists |
| POST | `/grocery-lists/:weekStart/generate` | Force-regenerate list (preserves manually-added items) |
| POST | `/grocery-lists/:weekStart/items` | Add a manual item |
| PATCH | `/grocery-lists/:weekStart/items/:itemId` | Update item (checked state, quantity, etc.) |
| DELETE | `/grocery-lists/:weekStart/items/:itemId` | Remove item |
| POST | `/grocery-lists/:weekStart/complete` | Checkout — mark list complete and consume inventory |

All errors use **Problem JSON** (RFC 7807) via `lib/errors.ts`.

---

## 5. Data Models

### InventoryItem (MongoDB)
```typescript
{
  userId: string;          // indexed
  name: string;
  quantity: number;
  unit: string;
  category: string;        // enum: CATEGORIES
  location: string;        // enum: LOCATIONS
  expiresAt?: Date;        // indexed
  expirationStatus: 'expired' | 'expiring-soon' | 'normal' | 'none';
}
```
- `expirationStatus` is auto-computed in a Mongoose pre-save hook via `lib/expiration.ts`
- Expiry logic: `expired` = today or earlier (midnight cutoff), `expiring-soon` = tomorrow, `normal` = 2+ days

### MealPlan (MongoDB)
```typescript
{
  userId: string;    // compound unique index with weekStart
  weekStart: Date;
  entries: {
    slotId: string;
    date: Date;
    mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
    meal: MealRecommendation;
  }[];
}
```
- Compound unique index on `(userId, weekStart)`
- `entries` subdocs have `_id: false`; `meal` stores a full `MealRecommendation` snapshot

### GroceryList (MongoDB)
```typescript
{
  userId: string;    // compound unique index with weekStart
  weekStart: Date;
  generatedAt: Date | null;
  items: {
    ingredientName: string;   // normalised key
    displayName: string;      // human-readable label
    quantity: number;
    unit: string;             // default: 'servings'
    category: GroceryCategory; // same enum as CATEGORIES on InventoryItem
    isPurchased: boolean;
    isManuallyAdded: boolean;
    sourceMealNames: string[]; // which meals need this ingredient
    notes: string;
  }[];
}
```
- Compound unique index on `(userId, weekStart)`
- Lazily created on first GET; `POST /:weekStart/generate` force-regenerates while preserving `isManuallyAdded` items
- `POST /:weekStart/complete` marks all items purchased and triggers inventory consumption

---

## 6. Environment Variables

Copy `.env.example` to `.env` before running locally.

> **Location:** The root `.env` is loaded by `tsx --env-file ../../.env` (dev) and Docker Compose. Always edit the root file — never create `.env` inside `packages/`.

| Variable | Default | Required |
|----------|---------|----------|
| `MONGODB_URI` | `mongodb://localhost:27017/fridge-planner` | Yes |
| `HOLODECK_URL` | `http://localhost:8001` | Yes (AI features) |
| `OPENAI_API_KEY` | — | Yes for AI features — sole LLM credential (both agents run on the OpenAI provider) |
| `AUTH_ISSUER` | — | No (CR-001, production OIDC) |
| `AUTH_AUDIENCE` | — | No (CR-001, production OIDC) |
| `AUTH_JWKS_URI` | — | No (CR-001, production OIDC) |
| `NODE_ENV` | `development` | No |
| `LOG_LEVEL` | `info` | No |
| `REDIS_URL` | `redis://localhost:6379` | No (P2+, not required for P1 MVP) |

> Single Next process on `:3000`, same-origin — so **no `PORT`/`CORS_ORIGIN`/`BACKEND_URL`** (removed with Express in Phase C-bis). For local `next dev`, put `MONGODB_URI` + `HOLODECK_URL` in `packages/client/.env.local`.

> **Auth note (spec 002 / Phase D):** `src/server/auth.ts` `authenticate(request)` validates an OIDC Bearer JWT (`jose`: JWKS signature + `iss`/`aud`/`exp`) and returns the `sub` claim as `userId`. `AUTH_MODE=dev` (default off-production) keeps the `X-User-Id` seam for local dev + tests; `AUTH_MODE=oidc` is required in production (the dev seam is refused there). Handlers call `await authenticate(request)`; a failure throws `AuthError` → `withRoute` returns 401 Problem JSON.

---

## 7. Code Conventions

### TypeScript Rules (enforced by ESLint + tsconfig)
- **Strict mode** (`"strict": true`, `"noUncheckedIndexedAccess": true`, `"noImplicitOverride": true`, `"exactOptionalPropertyTypes": true`)
- **No `any`** — use proper types or `unknown`
- **Explicit return types** on all functions (not just exported)
- **No unused variables** — args may be prefixed with `_` to suppress (`argsIgnorePattern: ^_`)
- **No `console.log`** — use `console.warn` or `console.error`; bare log triggers ESLint warning
- **`interface`** for object shapes; `type` for unions/intersections
- **Cyclomatic complexity** limit: 10 per function

### Naming
| Entity | Convention | Example |
|--------|-----------|---------|
| React components | PascalCase | `MealCard.tsx` |
| Utilities / routes | kebab-case | `date-utils.ts`, `error-handler.ts` |
| TypeScript interfaces | PascalCase | `InventoryItem`, `MealRecommendation` |
| Tailwind classes | Mobile-first | `class="flex md:grid"` |

### Formatting (Prettier)
- 2-space indentation
- Single quotes
- Trailing commas everywhere (`"trailingComma": "all"` — includes function parameters)
- 100-character line width
- Semicolons required

### React Patterns
- **Functional components only** — no class components
- **Context + hooks** for state — no Redux or Zustand
- Each context exports a custom hook (`useInventory()`, `useMealPlan()`, `useRecommendations()`, `useGroceryList()`)
- **Presentational vs container:** keep UI components pure; logic lives in hooks/context
- `useCallback`/`useMemo` only when profiling justifies it

### Route Handler Patterns (Next.js)
- **Thin handlers, extracted logic:** `app/api/v1/**/route.ts` handlers do only `connectDb()` → `await authenticate(request)` (→ userId, or `AuthError`) → parse body/params → call a `src/server/controllers/*` function → `NextResponse.json`. All real logic lives in the controllers (so it's testable without HTTP).
- Controllers return a framework-agnostic `ControllerResult` (`{ status, body }`); use `problem()` (`src/server/http.ts`) for RFC-7807 errors.
- Wrap each handler body in `withRoute(async () => { … })` (`src/server/route-helpers.ts`) so unhandled throws become a Problem JSON 500.
- `async/await` throughout; **Zod** for request body/query validation before processing.
- Rate-limit in the handler via `rateLimit(key, limit, windowMs)` (`src/server/rate-limit.ts`) — e.g. recommendations = 10/min.
- Server-only modules (`db.ts`, `auth.ts`, controllers, services) start with `import 'server-only'`.
- Next 15: route `params` is a **Promise** — `const { id } = await ctx.params`.

---

## 8. Testing

All tests run under **Vitest** in the one `packages/client` package (Express + Jest are gone).

### Server-layer tests (Vitest, node environment) — `tests/server/`
- **Location:** `packages/client/tests/server/` (API handler tests) and `tests/server/unit/` (lib/service units).
- First line `// @vitest-environment node`; in-memory MongoDB via `mongodb-memory-server`; `vitest.config.ts` aliases `@server` → `src/server` and stubs `server-only`.
- **Handler tests** import the route handlers, set `process.env.MONGODB_URI` to the memory server, and call `GET/POST/…` with real `Request` objects — they exercise handler + controller + model end-to-end.
- Mock the Holodeck agent: stub `getMealRecommendations` (controller fallback tests) **or** `global.fetch` (the agent-client's own fetch/parse logic).

```typescript
// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { getExpirationStatus } from '@server/lib/expiration';

describe('getExpirationStatus', () => {
  it('returns expired for past dates', () => {
    expect(getExpirationStatus(new Date(Date.now() - 86400000))).toBe('expired');
  });
});
```

### Client / component tests (Vitest + React Testing Library)
- **Location:** `packages/client/tests/` (components/, context/, lib/, views/, app/)
- **Coverage threshold:** 70%
- Environment: `jsdom`; setup file at `tests/setup.ts`
- `tests/setup.ts` mocks `next/navigation` and `next/link` — required for any component using Next.js router hooks
- Services layer (`src/services/`) excluded from coverage; mock all API calls (services layer)
- Test user interactions and rendered output — avoid testing implementation details

```typescript
// Component test example
import { render, screen } from '@testing-library/react';
import MealCard from '../../src/components/recommendations/MealCard';

it('shows expiring badge when ingredient expires soon', () => {
  render(<MealCard meal={mockMeal} hasExpiringSoon />);
  expect(screen.getByText(/expiring soon/i)).toBeInTheDocument();
});
```

### Pre-commit Hook
`husky` runs `lint-staged` on every commit — it auto-fixes ESLint errors and Prettier formats all staged `.ts/.tsx/.css` files. **Never skip hooks.**

---

## 9. AI Agent (Holodeck / Meal Recommender)

- **Config:** `agents/meal-recommender/agent.yaml`
- **Instructions:** `agents/meal-recommender/instructions/system-prompt.md`
- **Model:** OpenAI `gpt-4o` (Semantic Kernel backend — **migrated off Claude** to decouple from Anthropic; SK needs no Node.js runtime)
- **Temperature:** 0.5, **Max tokens:** 2000
- **Auth:** `OPENAI_API_KEY` (`model.api_key: ${OPENAI_API_KEY}`)

The agent receives inventory data (sorted by expiry date) and returns a JSON array of `MealRecommendation` objects. It must **never** return markdown or prose — only raw JSON.

**Evaluation metrics** (G-Eval, evaluated by Azure OpenAI at temperature 0.0 — separate from the inference model for independence):
- `ExpiryPrioritisation` — uses ingredients expiring soonest (threshold: 0.8) — **active**
- `Practicality`, `MissingIngredientMinimization`, `IngredientVariety`, `RecipeUrlConformance` — defined in `agent.yaml` but currently disabled (commented out)

One active test case ("Prioritise expiring chicken") is defined in `agent.yaml` under `test_cases`.

**Caching:** `services/recommendations-cache.ts` caches results by `(userId, ingredients)` key with a **15-minute TTL**. Cache is invalidated per-user (`invalidateUser(userId)`) on any inventory mutation.

**Recipe-URL grounding (Option A):** the OpenAI backend has **no web-search tool** (Holodeck exposes none for non-Claude providers), so the agent is instructed to **never author `recipeUrl`/`imageUrl`** (no fabricated links). Instead, `src/server/services/recipe-verifier.ts` attaches a URL server-side, only when a real page is found: Brave `site:`-restricted search of the 4 approved domains (panlasangpinoy.com, recipetineats.com, kawalingpinoy.com, taste.com.au), then a Spoonacular fallback, gated by title-similarity — else the field is omitted. **FR-037 (2026-07-15): a verified link is now REQUIRED on every displayed meal** — the controller drops unlinked meals, tops up once via a second agent call (excluding seen names) when fewer than 3 remain, and returns **503 Problem JSON** when zero meals can be linked. At least one of `BRAVE_SEARCH_API_KEY` / `SPOONACULAR_API_KEY` must therefore be set for recommendations to work; `POPULAR_RECIPES` fallbacks carry hand-verified links. Runs in the recommendations controller before caching.

**Observability:** Full tracing enabled in `agent.yaml` — traces, metrics, and structured logs are exported via OTLP to `${OTLP_ENDPOINT}`. Evaluation results are saved to `agents/meal-recommender/results/`.

**Deployment:** Agent is containerised (`linux/amd64` for the LAN host), published to `ghcr.io/emtabiraobarias/fridge-planner` by `.github/workflows/agent-image.yml` (tag `agent-v*`).

### 9a. Second agent — Feedback Collector (spec 003 / Phase F)

A **second Holodeck agent** collects bug/improvement feedback conversationally and saves structured, spec-shaped records (exportable as `/speckit.specify` markdown). One Holodeck instance serves one agent, so it runs in its **own container/port**.

- **Config:** `agents/feedback-collector/agent.yaml` (+ `agent.serve.yaml` serve variant — no `${…}` except the single `OPENAI_API_KEY` reference in `model.api_key`; holodeck interpolates over comments too). **Model:** OpenAI `gpt-4o` (Semantic Kernel backend — **migrated off Claude** like the meal-recommender), temp **0.3**, `api_key: ${OPENAI_API_KEY}`. **No web tools** (the SK backend exposes none — it only converses; also removes an injection amplifier). Evals: `JSONProtocolCompliance`/`ClarifyingQuestionQuality`/`SpecReadiness`.
- **Protocol (raw JSON only):** the backend replays the whole transcript each turn (**stateless**, CR-018) framed with untrusted-data markers; the agent returns exactly one object — `{status:"collecting",reply,missing[]}` or `{status:"complete",reply,record{…}}`. At the ~30-turn cap the backend appends `FINALIZE NOW`.
- **Local:** `docker compose up -d --build holodeck-feedback` (port **8002**). The Next app reads **`FEEDBACK_AGENT_URL`** (`http://localhost:8002` locally). When unset/unreachable the `/api/v1/feedback` chat endpoints return **502** and preserve the draft — the rest of the app is unaffected.
- **App wiring:** `src/server/services/feedback-collector.ts` (client — fence-strip + zod discriminated-union validation), `controllers/feedback.ts`, `models/feedback-record.ts`, `lib/feedback-export.ts` (spec-template markdown), routes under `app/api/v1/feedback/**`; UI at `/feedback` (`views/FeedbackPage.tsx`, `context/FeedbackContext.tsx`, `components/feedback/*`).
- **Base-image note (2026-07-11):** the current `holodeck-base:latest` (Debian trixie) **rejects `claude.setting_sources`** and **no longer bundles Node.js**. Neither matters post-OpenAI-migration (no Node.js, no `claude:` block needed) — the feedback Dockerfile no longer installs `nodejs`. Kept for history in case an Anthropic agent returns.
- **Base-image note (2026-07-14):** `holodeck-base:latest` now ships **Holodeck 0.7.x**, which routes `provider: openai` to a new **OpenAI Agents SDK backend** (`import agents`) instead of Semantic Kernel. The `openai-agents` package is an optional extra **not bundled in the base image** — without it the container passes `/health` (lazy backend init) but the **first chat turn fails with `No module named 'agents'`**. Both agent Dockerfiles therefore `pip install "holodeck-ai[openai-agents]==<base's holodeck version>"`; keep that line when touching either Dockerfile.
- **Prod (Phase F6, wired):** the second agent image `…/fridge-planner-feedback` is published by `.github/workflows/agent-feedback-image.yml` (tag `agent-feedback-v*`, linux/amd64); `docker-compose.prod.yml` runs it as the internal `holodeck-feedback` service (`:8002`, `FEEDBACK_AGENT_IMAGE`, `OPENAI_API_KEY`), and the `app` service reads `FEEDBACK_AGENT_URL`. See `docs/deployment.md` → "Updating a running deployment".

---

## 10. Git Workflow

> **Two-implementation model:** This repo keeps two long-lived implementation branches — `impl/vite` and `impl/nextjs` — against one shared spec on `main`. *Implementation* work happens on the `impl/*` branch (this is `impl/nextjs`); *spec/contract* changes are authored on `main` and merged down. See `specs/BRANCHING_STRATEGY.md` (canonical on `main`) before any branch operation.

- **Spec/contract work:** branch short-lived `feat/`, `fix/`, `docs/` branches off `main`, merge back to `main`; both impls inherit on next sync.
- **Implementation work:** commit on the long-lived `impl/*` branch directly (or `claude/<description>-<id>` branches off it that merge back to `impl/*`, not `main`).
- **Commit format:** Conventional Commits — `feat: add expiry-aware meal suggestions`
- **Before pushing:** `npm run lint && npm test` must pass
- **PRs require:** all tests green, zero lint warnings

---

## 11. Feature Specification Workflow

New features follow a **spec-first** process. Templates live in `.specify/templates/`; the workflow is driven by Claude Code slash commands in `.claude/commands/`.

### Steps
1. **Scaffold:** Run `.specify/scripts/bash/create-new-feature.sh` with the feature name. This creates a numbered directory under `specs/` from the templates in `.specify/templates/`.
2. **Write `spec.md`:** Run `/speckit.specify` — Claude will clarify requirements and write the spec. Each user story must be independently testable.
3. **Write `plan.md`:** Run `/speckit.plan` — Claude produces architecture decisions, component design, API changes, and phase breakdown.
4. **Write `tasks.md`:** Run `/speckit.tasks` — Claude derives an implementation checklist from the spec and plan.
5. **Analyse:** Run `/speckit.analyze` — cross-checks spec, plan, and tasks for gaps, ambiguities, and constitution conflicts before coding starts.
6. **Implement:** Run `/speckit.implement` or work through `tasks.md` manually. Branch naming follows section 10.

### Additional Commands
| Command | Purpose |
|---------|---------|
| `/speckit.clarify` | Ask targeted clarifying questions about requirements |
| `/speckit.checklist` | Generate a domain-specific requirements quality checklist (e.g., UX, security, API) |
| `/speckit.constitution` | View or update the project constitution |
| `/speckit.taskstoissues` | Convert `tasks.md` items into GitHub issues |

### Reference
| Path | Purpose |
|------|---------|
| `.claude/commands/` | All speckit slash commands |
| `.specify/templates/` | Markdown templates: spec, plan, tasks, checklist, constitution, agent-file |
| `.specify/scripts/bash/create-new-feature.sh` | Scaffold a new feature spec directory (main entry point) |
| `.specify/memory/constitution.md` | Stored project constitution |
| `specs/001-meal-planner/` | Working example (spec.md, plan.md, checklists/) |

### Bug Fixes (ensuring spec adherence)

A bug is a **code failure** to meet an existing spec requirement — the spec itself does not change.

1. **Locate the violated requirement** — find the acceptance scenario and `FR-XXX` in `specs/<feature>/spec.md` that the defect contradicts. If no FR covers it, the spec is incomplete → treat as a spec tweak (see below).
2. **Write a failing test** — cite the FR number in the test name so the traceability is permanent: `it('excludes items expiring today (FR-007)', ...)`.
3. **Fix the code** — make the test pass without touching spec, plan, or tasks.
4. **Commit** referencing the FR: `fix: midnight cutoff off-by-one (FR-007)`.

> If you find yourself wanting to change the spec to match what the code does, stop — that is a spec tweak, not a bug fix.

### Spec Tweaks (cascading updates)

When a requirement itself changes, update files in strict cascade order — each layer is the source of truth for the one below it:

| Step | File | What to update |
|------|------|----------------|
| 1 | `specs/<feature>/spec.md` | Revise the acceptance scenario, `FR-XXX` statement, or `SC-XXX` metric |
| 2 | *(run `/speckit.analyze`)* | Surfaces gaps in plan and tasks caused by the spec change |
| 3 | `specs/<feature>/plan.md` | Update Technical Context, Constitution Check, or phase breakdown if the approach changes |
| 4 | `specs/<feature>/tasks.md` | Add, remove, or reorder tasks to match the revised plan |
| 5 | `specs/<feature>/checklists/` | Add or remove checklist items if validation criteria changed |
| 6 | `.specify/memory/constitution.md` | Amend only if the change conflicts with or requires a new constitutional principle; increment version (`MINOR` for new guidance, `PATCH` for clarifications) |

After updating the spec, any existing code that no longer satisfies the revised requirement becomes a bug — apply the bug-fix workflow above.

**Deciding which workflow applies:**
- "The code is wrong for what we originally intended" → **Bug fix** (code changes only)
- "What we intended has changed" → **Spec tweak** (spec → plan → tasks → code)

---

## 12. Known Issues & TODOs

| ID | Description | Location |
|----|-------------|----------|
| ~~CR-001~~ | ✅ Done (Phase D / spec 002) — `authenticate()` validates OIDC JWTs; `X-User-Id` is the dev-only seam | `packages/client/src/server/auth.ts` |
| CR-013 | OpenAPI 3.0 spec not yet written — deferred until API shape stabilises post-Phase 2 | `packages/client/app/api/v1/` |
| — | Drag-and-drop has intermittent bugs noted in commit history | `packages/client/src/views/CalendarPage.tsx` |
| — | No CI/CD pipeline — GitHub Actions deferred (would run `validate-e2e.sh --no-agent` + Vitest) | repo root |
| — | Redis-backed cache deferred to Phase 2+ | `REDIS_URL` in `.env.example` |

---

## 13. Key Files Quick Reference

| File | Purpose |
|------|---------|
| `constitution.md` | Core principles and governance — source of truth |
| `packages/client/app/` | Next.js App Router entrypoint — layout, routes, providers, nav |
| `packages/client/next.config.ts` | Next.js build configuration |
| `packages/client/src/views/` | Page-level view components (`InventoryPage`, `CalendarPage`, `GroceryListPage`) |
| `specs/001-meal-planner/spec.md` | Feature requirements |
| `specs/001-meal-planner/plan.md` | Implementation plan |
| `agents/meal-recommender/agent.yaml` | Holodeck agent config — model, eval metrics, test cases |
| `agents/meal-recommender/instructions/system-prompt.md` | Claude system prompt for meal AI |
| `packages/client/app/api/v1/` | Route Handlers (the backend) — thin adapters over `src/server/controllers/` |
| `packages/client/src/server/db.ts` | globalThis-cached Mongoose connection |
| `packages/client/src/server/http.ts` + `route-helpers.ts` | `ControllerResult`/`problem()` + `withRoute()` error wrapper |
| `packages/client/src/server/lib/expiration.ts` | Expiration status logic (midnight cutoff) |
| `packages/client/src/server/lib/grocery-list-generator.ts` | Generates grocery list items from a meal plan + inventory |
| `scripts/smoke-test.sh` + `scripts/validate-e2e.sh` | E2E release gate (see `docs/smoke-test.md`) |
| `.env.example` | All environment variables documented |
| `.specify/templates/` | Spec, plan, and tasks templates for new features |
| `.specify/scripts/bash/create-new-feature.sh` | Scaffold a new feature spec directory |

---

## 14. Things NOT to do

**Don't add a vector store or embedding layer to the AI agent.**
ChromaDB and Ollama embeddings were added then removed (commit `983ec78`). The meal recommender doesn't need semantic search — it receives structured inventory JSON directly. Adding embedding infrastructure is over-engineering for this use case.

**For Anthropic agents, don't set `auth_provider: api_key` in `agent.yaml`.**
Anthropic-specific rule, currently dormant: **both agents now run on `provider: openai`** with `api_key: ${OPENAI_API_KEY}` (the correct field for OpenAI — no `auth_provider`). If an Anthropic agent is ever (re)introduced, use `auth_provider: oauth_token` (`CLAUDE_CODE_OAUTH_TOKEN`); `ANTHROPIC_API_KEY` is the fallback, not the default (commit `da0f65f`).

**Don't let the meal recommender return prose or markdown.**
The original agent returned human-readable text; the system prompt was rewritten to enforce raw JSON only (commit `4082def`). Any prompt change that loosens this constraint will break the client's JSON parser.

**Don't use `.js` extensions in server-layer import paths.**
`src/server/` is bundled by Next.js (`"moduleResolution": "Bundler"`) — imports are **extensionless** (`import { foo } from './bar'`), and use the `@server/*` alias for cross-tree imports. (This is the opposite of the old Express `NodeNext` rule, which required `.js` — that package is gone.)

**Don't import `src/server/*` from a Client Component.**
The server layer is Node-only (Mongoose, secrets) and guarded with `import 'server-only'`, which throws if pulled into the client bundle. Browser code reaches the API only through `src/services/*` (`fetch`). Keep models/DB/agent code behind the Route Handlers.

**Don't re-introduce Express or a separate API server.**
Phase C-bis retired Express into Next.js Route Handlers (one process on `:3000`); `packages/server` was deleted. Add backend behaviour as a Route Handler + `src/server/controllers/*`, not a new service. (This is branch-scoped — `impl/vite` still runs Express.)

**Don't manually set `expirationStatus` in `findOneAndUpdate` calls.**
`expirationStatus` is auto-computed by a Mongoose `pre('findOneAndUpdate')` hook in `src/server/models/inventory-item.ts` whenever `expiresAt` changes. Writing it directly in an update will produce a stale value or get overwritten; always let the hook manage it.

**Don't add state management libraries (Redux, Zustand, etc.).**
All shared state uses React Context + custom hooks. Adding a third-party store would duplicate the existing pattern and violate the architecture constraint in `constitution.md`.

**Don't revert THIS branch (`impl/nextjs`) to Vite or recreate `vite.config.ts` for the client.**
This rule is **branch-scoped**: the Vite implementation lives on its own long-lived `impl/vite` branch and is kept alive deliberately — do not delete or "fix" it from here. On `impl/nextjs`, the client was fully migrated to Next.js 15 App Router (commit `08c9e47`): `vite.config.ts` is gone; `vitest.config.ts` handles tests only; the dev server runs on port 3000 via `next dev --port 3000`, not Vite's 5173.

**Don't create files under `src/pages/` in the client.**
Next.js reserves `pages/` for the Pages Router. The App Router lives in `app/`; page-level view components live in `src/views/`. Using `src/pages/` will confuse both the framework and developers.

---

## 15. Deployment (staged, Portainer, orchestrated)

Production deploys via a **staged runbook driven by an orchestrator**, so most file work is automated while Portainer/router/host steps prompt the human.

**Strategy:** stand the stack up **internally first** (Stage 1 — LAN hostname `fridgeplanner.lan`, Caddy internal CA), prove it end-to-end, then **go public** (Stage 2 — real domain, Let's Encrypt, router forwarding). The internal smoke test is a hard gate before any Stage 2 step.

**Files (all already in the repo unless noted):**
- `docker-compose.prod.yml` (repo root) — the prod stack. Only `caddy` publishes ports; app pulls `${APP_IMAGE:-ghcr.io/emtabiraobarias/fridge-planner-client}`; `mongodb`/`holodeck`/`keycloak`/`keycloak-db` are internal on `fpnet`; `${VAR:?}` fail-fast. `AUTH_JWKS_URI` targets the **internal** `http://keycloak:8080` by design (server-to-server); only `AUTH_ISSUER` uses the public host. `AUTH_ALLOW_DEV` is intentionally absent (FR-D-008).
- `deploy/Caddyfile` — Stage 1 `local_certs` + `fridgeplanner.lan`/`auth.fridgeplanner.lan`, 300s timeouts.
- `deploy/prod.env.example` — the host `.env` template (placeholders): `MONGO_ROOT_USER/PASSWORD`, `OIDC_REALM`, `OIDC_AUDIENCE`, `KC_DB_*`, `KC_ADMIN_*`, `APP_IMAGE`, LLM creds.
- `deploy/checklist.yaml` — machine-readable step manifest the orchestrator walks.
- `deploy/state.json` — progress + decisions; lets the orchestrator resume across sessions (seed: `deploy/state.example.json`).
- `docs/deployment.md` — the prose runbook.
- `.claude/skills/deploy-runbook/SKILL.md` — the orchestrator. Invoke `/deploy-runbook` (or "continue the deployment"); `/deploy-runbook status` shows progress.
- `.claude/agents/deploy-file-writer.md` — subagent that verifies/edits the deploy files + CI. Never deploys, never touches Portainer.
- `.github/workflows/deploy-nextjs.yml` — the **existing** CD workflow: digest-pinned build-push (`:<version>` + `:sha-*` + `:latest`) with the manual Portainer rollout printed in the run summary. **The self-hosted-runner deploy job was removed 2026-07-15** (prod is a git-backed Portainer **CE** stack — no host compose dir for a runner, no CE webhooks; resurrect from git history at tag `nextjs-v4.1.1` if the topology changes). The orchestrator **edits** it in Stage 2 (OIDC build-args) — never regenerates it.

**The automation boundary:**
- **agent (automated in repo):** verify/edit `docker-compose.prod.yml`, `deploy/Caddyfile`, `.github/workflows/deploy-nextjs.yml`. Most are verify-only (files already exist and are correct).
- **manual (human, prompted):** Portainer stack deploy/redeploy, stack env vars, container console, trusting the internal CA, router port-forwarding, host firewall, DNS, Keycloak realm/client. The orchestrator **stops** at these and never simulates them.

**Rules (in addition to §7/§14):**
- Secrets never enter the repo — only `deploy/prod.env.example` (placeholders) is committed. Real values go in Portainer stack env (Path A) or a host `.env` next to the compose (Path B).
- `AUTH_ALLOW_DEV` must never appear in any committed file or production env.
- App image is `ghcr.io/emtabiraobarias/fridge-planner-client`; `…/fridge-planner` (no suffix) is the Holodeck image.
- CD is **edition-aware**: Portainer **CE** can't use stack webhooks (Business-only). **Decided 2026-07-15:** the prod stack is git-backed on CE, so CI **stops at build-push** and rollout is a manual Portainer **Pull and redeploy** (the self-hosted-runner deploy job was removed — a git-backed stack has no host compose dir for a runner to operate on); **BE** could POST a redeploy webhook behind the gate.
- The prod stack deploys **through Portainer**; the dev `docker compose` commands in §2 are for local development only.

---

## 16. Orchestration workflow

You (Fable) are the orchestrator. Plan, decompose, synthesize. Reasoning-heavy phases go to deep-reasoner (Opus). Mechanical work goes to fast-worker (Sonnet). For high-stakes decisions, run deep-reasoner twice with slightly different framings and synthesize the best of both. Keep your own context lean. Delegate rather than doing mechanical work yourself.