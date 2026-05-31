# Fridge Planner — Claude AI Guide

This file is the primary reference for AI assistants working in this repository. It covers codebase structure, development workflows, conventions, and rules that must be followed.

---

## 1. Repository Overview

**Fridge Planner** is a full-stack TypeScript monorepo for meal planning. Users track fridge inventory (with expiration awareness), receive AI-powered meal suggestions, and assign meals to a drag-and-drop weekly calendar.

**Tech Stack:**
- **Frontend:** React 18 + Next.js 15 (App Router) + Tailwind CSS (port 3000)
- **Backend:** Express 4 + Mongoose + MongoDB (port 3001)
- **AI Agent:** Holodeck with Claude Sonnet 4.6 (port 8001)
- **Language:** TypeScript (strict mode throughout)
- **Monorepo:** npm workspaces (`packages/client`, `packages/server`)

---

## 2. Commands

Run all commands from the **repo root** unless noted otherwise.

### Development
| Command | Description |
|---------|-------------|
| `npm run dev` | Start client + server concurrently |
| `npm run client` | Client only (Next.js, port 3000) |
| `npm run server` | Server only (tsx watch, port 3001) |
| `npm run debug` | Client + server with Node inspector |

### Quality
| Command | Description |
|---------|-------------|
| `npm run lint` | ESLint on all `packages/*/src` (zero warnings) |
| `npm run format` | Prettier on all TS/TSX/CSS source files |
| `npm test` | Run all tests (server Jest → client Vitest) |

### Per-Package
```bash
# Server
npm -w packages/server run test          # all server tests
npm -w packages/server run test -- --testPathPattern=inventory  # filtered
npm -w packages/server run build         # production build 

# Client
npm -w packages/client run test          # all client tests
npm -w packages/client run build         # production build (next build)
```

### Docker (full stack)
```bash
docker compose up --build               # MongoDB + Holodeck + server + Next.js client
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
│   ├── client/
│   │   ├── app/                      # Next.js App Router entrypoint
│   │   │   ├── layout.tsx            # Root layout (fonts, global providers)
│   │   │   ├── page.tsx              # / → InventoryPage
│   │   │   ├── providers.tsx         # Client-side context providers wrapper
│   │   │   ├── nav.tsx               # Top navigation bar
│   │   │   ├── calendar/page.tsx     # /calendar route
│   │   │   └── grocery/page.tsx      # /grocery route
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── calendar/         # WeeklyCalendar, CalendarSlot, CalendarMealCard, MealSlotCard, MealDetailModal
│   │   │   │   ├── grocery/          # AddGroceryItemForm, GroceryListHeader, GroceryListCategoryGroup,
│   │   │   │   │                     # GroceryListItemRow, GroceryListSearchBar, CheckoutConfirmModal
│   │   │   │   ├── inventory/        # InventoryForm, InventoryList
│   │   │   │   ├── recommendations/  # RecommendationsPanel, MealCard, DraggableMealCard
│   │   │   │   └── shared/
│   │   │   ├── context/              # InventoryContext, MealPlanContext, RecommendationsContext, GroceryListContext
│   │   │   ├── views/                # InventoryPage, CalendarPage, GroceryListPage (all 'use client')
│   │   │   ├── services/             # inventory.ts, meal-plans.ts, grocery-lists.ts (API fetch wrappers)
│   │   │   ├── types/                # meal-plan.ts, meal-recommendation.ts, grocery-list.ts
│   │   │   └── lib/                  # date-utils.ts
│   │   └── tests/                    # Vitest — components/, context/, lib/, views/, app/
│   │
│   └── server/
│       ├── src/
│       │   ├── api/v1/               # inventory.ts, recommendations.ts, meal-plans.ts, grocery-lists.ts
│       │   ├── middleware/           # auth.ts, error-handler.ts, rate-limiter.ts
│       │   ├── models/               # inventory-item.ts, meal-plan.ts, grocery-list.ts (Mongoose schemas)
│       │   ├── services/             # meal-recommender.ts, recommendations-cache.ts
│       │   ├── lib/                  # expiration.ts, errors.ts, ingredient-consumption.ts,
│       │   │                         # grocery-list-generator.ts, ingredient-categorizer.ts,
│       │   │                         # ingredient-matcher.ts, unit-normalizer.ts
│       │   ├── types/                # meal-plan.ts, meal-recommendation.ts, grocery-list.ts
│       │   ├── app.ts                # Express app setup
│       │   └── index.ts              # Entry point
│       └── tests/
│           ├── integration/          # inventory, meal-plans, recommendations, grocery-lists
│           └── unit/                 # expiration, models, services, middleware, grocery lib
│
├── agents/meal-recommender/
│   ├── agent.yaml                # Holodeck config (model, eval metrics, test cases)
│   └── instructions/             # Claude system prompt
│
├── specs/001-meal-planner/       # spec.md, plan.md, checklists/
├── docker-compose.yml
├── .env.example                  # All required env vars documented here
├── constitution.md               # Core principles (source of truth)
├── eslint.config.js              # ESLint flat config (v9)
└── .prettierrc                   # Formatting rules
```

---

## 4. API Endpoints

Base URL: `http://localhost:3001/api/v1`

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
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Preferred for AI |
| `ANTHROPIC_API_KEY` | — | Fallback for AI |
| `OPENAI_API_KEY` | — | Fallback if Anthropic unavailable in Holodeck |
| `AUTH_ISSUER` | — | No (CR-001, production OIDC) |
| `AUTH_AUDIENCE` | — | No (CR-001, production OIDC) |
| `AUTH_JWKS_URI` | — | No (CR-001, production OIDC) |
| `PORT` | `3001` | No |
| `NODE_ENV` | `development` | No |
| `CORS_ORIGIN` | `http://localhost:3000` | No |
| `LOG_LEVEL` | `info` | No |
| `REDIS_URL` | `redis://localhost:6379` | No (P2+, not required for P1 MVP) |

> **Auth note:** `middleware/auth.ts` is a development stub — it reads `X-User-Id` header and defaults to `'anonymous'`. Production OIDC validation is a known TODO (CR-001).

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

### Express Patterns
- `async/await` for all async operations; never `.then()` chains in route handlers
- Wrap handlers in `try/catch`; let `middleware/error-handler.ts` handle the rest
- **Zod** for request body/query validation before processing
- Apply rate limiting middleware at the router level

---

## 8. Testing

### Server (Jest + ts-jest)
- **Location:** `packages/server/tests/unit/` and `tests/integration/`
- **Coverage threshold:** 80% (branches, functions, lines, statements)
- In-memory MongoDB via `mongodb-memory-server` — no real DB in tests
- Mock Holodeck HTTP calls in recommender tests
- Route files (`api/v1/`) are excluded from unit coverage — they're covered by integration tests
- ESM imports in test files must use `.js` extension (Jest's `moduleNameMapper` resolves them to `.ts`)

```typescript
// Unit test example
import { describe, it, expect } from '@jest/globals';
import { getExpirationStatus } from '../../src/lib/expiration.js';

describe('getExpirationStatus', () => {
  it('returns expired for past dates', () => {
    const yesterday = new Date(Date.now() - 86400000);
    expect(getExpirationStatus(yesterday)).toBe('expired');
  });
});
```

### Client (Vitest + React Testing Library)
- **Location:** `packages/client/tests/`
- **Coverage threshold:** 70%
- Environment: `jsdom`; setup file at `tests/setup.ts`
- `tests/setup.ts` mocks `next/navigation` and `next/link` — required for any component using Next.js router hooks
- Services layer (`src/services/`) excluded from client coverage — covered by server integration tests
- Test user interactions and rendered output — avoid testing implementation details
- Mock all API calls (services layer)

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
- **Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)
- **Temperature:** 0.5, **Max tokens:** 2000
- **Auth:** OAuth token preferred (`CLAUDE_CODE_OAUTH_TOKEN`); falls back to `ANTHROPIC_API_KEY`

The agent receives inventory data (sorted by expiry date) and returns a JSON array of `MealRecommendation` objects. It must **never** return markdown or prose — only raw JSON.

**Evaluation metrics** (G-Eval, evaluated by Azure OpenAI at temperature 0.0 — separate from the inference model for independence):
- `ExpiryPrioritisation` — uses ingredients expiring soonest (threshold: 0.8) — **active**
- `Practicality`, `MissingIngredientMinimization`, `IngredientVariety`, `RecipeUrlConformance` — defined in `agent.yaml` but currently disabled (commented out)

One active test case ("Prioritise expiring chicken") is defined in `agent.yaml` under `test_cases`.

**Caching:** `services/recommendations-cache.ts` caches results by `(userId, ingredients)` key with a **15-minute TTL**. Cache is invalidated per-user (`invalidateUser(userId)`) on any inventory mutation.

**Agent capabilities:** `WebSearch` and `WebFetch` are enabled — the agent looks up real recipes from approved domains (panlasangpinoy.com, recipetineats.com, kawalingpinoy.com, taste.com.au). `extended_thinking` is disabled. `claude.max_turns` is 15; `setting_sources: []` ensures no inheritance from local Claude settings.

**Observability:** Full tracing enabled in `agent.yaml` — traces, metrics, and structured logs are exported via OTLP to `${OTLP_ENDPOINT}`. Evaluation results are saved to `agents/meal-recommender/results/`.

**Deployment:** Agent is containerised for GCP Cloud Run (`linux/arm64`), published to `ghcr.io/emtabiraobarias/fridge-planner`.

---

## 10. Git Workflow

- **Branch from `main`:** `feat/`, `fix/`, `refactor/`, `test/`, `docs/` prefixes for human work; Claude Code auto-generates `claude/<description>-<id>` branches
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
| CR-001 | Auth stub — replace X-User-Id header with proper OIDC/JWT validation | `packages/server/src/middleware/auth.ts` |
| CR-013 | OpenAPI 3.0 spec not yet written — deferred until API shape stabilises post-Phase 2 | `packages/server/src/api/` |
| — | Drag-and-drop has intermittent bugs noted in commit history | `packages/client/src/pages/CalendarPage.tsx` |
| — | No CI/CD pipeline — GitHub Actions deferred until test suite is stable | repo root |
| — | No E2E tests — unit + integration tests are the current confidence ceiling | `packages/*/tests/` |
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
| `packages/server/src/lib/expiration.ts` | Expiration status logic (midnight cutoff) |
| `packages/server/src/lib/errors.ts` | Problem JSON error helpers |
| `packages/server/src/lib/grocery-list-generator.ts` | Generates grocery list items from a meal plan + inventory |
| `.env.example` | All environment variables documented |
| `.specify/templates/` | Spec, plan, and tasks templates for new features |
| `.specify/scripts/bash/create-new-feature.sh` | Scaffold a new feature spec directory |

---

## 14. Things NOT to do

**Don't add a vector store or embedding layer to the AI agent.**
ChromaDB and Ollama embeddings were added then removed (commit `983ec78`). The meal recommender doesn't need semantic search — it receives structured inventory JSON directly. Adding embedding infrastructure is over-engineering for this use case.

**Don't set `auth_provider: api_key` in `agent.yaml`.**
The agent originally defaulted to API key auth and was corrected to `oauth_token` (commit `da0f65f`). Always use `auth_provider: oauth_token`; `ANTHROPIC_API_KEY` is the fallback, not the default.

**Don't let the meal recommender return prose or markdown.**
The original agent returned human-readable text; the system prompt was rewritten to enforce raw JSON only (commit `4082def`). Any prompt change that loosens this constraint will break the client's JSON parser.

**Don't use `.ts` extensions in server-side import paths.**
The server uses `"moduleResolution": "NodeNext"` — imports must use `.js` even for `.ts` source files (e.g., `import { foo } from './bar.js'`). ESLint is configured to ignore `.js` files, so wrong extensions can silently compile but fail at runtime.

**Don't manually set `expirationStatus` in `findOneAndUpdate` calls.**
`expirationStatus` is auto-computed by a Mongoose `pre('findOneAndUpdate')` hook in `models/inventory-item.ts` whenever `expiresAt` changes. Writing it directly in an update will produce a stale value or get overwritten; always let the hook manage it.

**Don't add state management libraries (Redux, Zustand, etc.).**
All shared state uses React Context + custom hooks. Adding a third-party store would duplicate the existing pattern and violate the architecture constraint in `constitution.md`.

**Don't revert to Vite or recreate `vite.config.ts` for the client.**
The client was fully migrated to Next.js 15 App Router (commit `08c9e47`). `vite.config.ts` is gone; `vitest.config.ts` handles tests only. The dev server runs on port 3000 via `next dev --port 3000`, not Vite's 5173.

**Don't create files under `src/pages/` in the client.**
Next.js reserves `pages/` for the Pages Router. The App Router lives in `app/`; page-level view components live in `src/views/`. Using `src/pages/` will confuse both the framework and developers.