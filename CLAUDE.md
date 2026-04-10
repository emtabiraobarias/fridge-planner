# Fridge Planner — Claude AI Guide

This file is the primary reference for AI assistants working in this repository. It covers codebase structure, development workflows, conventions, and rules that must be followed.

---

## 1. Repository Overview

**Fridge Planner** is a full-stack TypeScript monorepo for meal planning. Users track fridge inventory (with expiration awareness), receive AI-powered meal suggestions, and assign meals to a drag-and-drop weekly calendar.

**Tech Stack:**
- **Frontend:** React 18 + Vite + Tailwind CSS (port 5173)
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
| `npm run client` | Client only (Vite, port 5173) |
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

# Client
npm -w packages/client run test          # all client tests
npm -w packages/client run build         # production build (tsc + vite)
```

### Docker (full stack)
```bash
docker compose up --build   # MongoDB + Holodeck + server + nginx/client
```

---

## 3. Project Structure

```
fridge-planner/
├── packages/
│   ├── client/src/
│   │   ├── components/
│   │   │   ├── calendar/         # WeeklyCalendar, CalendarSlot, MealDetailModal
│   │   │   ├── inventory/        # InventoryForm, InventoryList
│   │   │   └── recommendations/  # RecommendationsPanel, MealCard, DietaryPreferences
│   │   ├── context/              # InventoryContext, MealPlanContext, RecommendationsContext
│   │   ├── pages/                # CalendarPage
│   │   ├── services/             # inventory.ts, meal-plans.ts (API fetch wrappers)
│   │   ├── types/                # Shared TS interfaces
│   │   ├── lib/                  # date-utils.ts
│   │   ├── App.tsx
│   │   └── main.tsx
│   │
│   └── server/src/
│       ├── api/v1/               # inventory.ts, recommendations.ts, meal-plans.ts
│       ├── middleware/           # auth.ts, error-handler.ts, rate-limiter.ts
│       ├── models/               # InventoryItem.ts, MealPlan.ts (Mongoose schemas)
│       ├── services/             # meal-recommender.ts, recommendations-cache.ts
│       ├── lib/                  # expiration.ts, errors.ts, ingredient-consumption.ts
│       ├── types/
│       ├── app.ts                # Express app setup
│       └── index.ts              # Entry point
│
├── agents/meal-recommender/
│   ├── agent.yaml                # Holodeck config (model, eval metrics, test cases)
│   ├── instructions/             # Claude system prompt
│   └── data/recipes.json
│
├── specs/001-meal-planner/       # spec.md, plan.md
├── docker-compose.yml
├── .env.example                  # All required env vars documented here
├── constitution.md               # Core principles (source of truth)
├── AGENTS.md                     # Developer + agent guide
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
| POST | `/recommendations` | Get AI meal suggestions — body: `{ dietaryPreferences: string[] }` |

Rate limit: **10 req/min** (vs 100/min for other endpoints)

### Meal Plans
| Method | Path | Description |
|--------|------|-------------|
| GET | `/meal-plans/:weekStart` | Fetch weekly plan |
| POST | `/meal-plans/:weekStart/entries` | Assign meal to slot |
| PUT | `/meal-plans/:weekStart/entries/:slotId` | Move meal |
| DELETE | `/meal-plans/:weekStart/entries/:slotId` | Remove meal |

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
  userId: string;          // compound unique index with weekStart
  weekStart: Date;
  entries: MealPlanEntry[];  // [{ slotId, date, mealType, meal }]
}
```

---

## 6. Environment Variables

Copy `.env.example` to `.env` before running locally.

| Variable | Default | Required |
|----------|---------|----------|
| `MONGODB_URI` | `mongodb://localhost:27017/fridge-planner` | Yes |
| `HOLODECK_URL` | `http://localhost:8001` | Yes (AI features) |
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Preferred for AI |
| `ANTHROPIC_API_KEY` | — | Fallback for AI |
| `PORT` | `3001` | No |
| `NODE_ENV` | `development` | No |
| `CORS_ORIGIN` | `http://localhost:5173` | No |
| `LOG_LEVEL` | `info` | No |

> **Auth note:** `middleware/auth.ts` is a development stub — it reads `X-User-Id` header and defaults to `'anonymous'`. Production OIDC validation is a known TODO (CR-001).

---

## 7. Code Conventions

### TypeScript Rules (enforced by ESLint)
- **Strict mode** (`"strict": true`, `"noUncheckedIndexedAccess": true`)
- **No `any`** — use proper types or `unknown`
- **Explicit return types** on all exported functions
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
- Trailing commas in multiline
- 100-character line width
- Semicolons required

### React Patterns
- **Functional components only** — no class components
- **Context + hooks** for state — no Redux or Zustand
- Each context exports a custom hook (`useInventory()`, `useMealPlan()`, `useRecommendations()`)
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

```typescript
// Unit test example
import { calculateExpirationStatus } from '../../src/lib/expiration';

describe('calculateExpirationStatus', () => {
  it('returns expired for past dates', () => {
    const yesterday = new Date(Date.now() - 86400000);
    expect(calculateExpirationStatus(yesterday)).toBe('expired');
  });
});
```

### Client (Vitest + React Testing Library)
- **Location:** `packages/client/tests/`
- **Coverage threshold:** 70%
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
- **Model:** Claude Sonnet 4.6 (`claude-sonnet-4-6`)
- **Temperature:** 0.5, **Max tokens:** 3000
- **Auth:** OAuth token preferred (`CLAUDE_CODE_OAUTH_TOKEN`); falls back to `ANTHROPIC_API_KEY`

The agent receives inventory data (sorted by expiry date) and dietary preferences, and returns a JSON array of `MealRecommendation` objects. It must **never** return markdown or prose — only raw JSON.

**Evaluation metrics** (G-Eval):
- `ExpiryPrioritisation` — uses ingredients expiring soonest
- `Practicality` — suggests meals achievable from available items

**Caching:** `services/recommendations-cache.ts` caches results by `(userId, dietaryPreferences, ingredients)` key with a 5-minute TTL. Cache is invalidated on any inventory change.

---

## 10. Git Workflow

- **Branch from `main`:** `feat/`, `fix/`, `refactor/`, `test/`, `docs/` prefixes
- **Commit format:** Conventional Commits — `feat: add dietary filter to recommendations`
- **Before pushing:** `npm run lint && npm test` must pass
- **PRs require:** all tests green, zero lint warnings

---

## 11. Known Issues & TODOs

| ID | Description | Location |
|----|-------------|----------|
| CR-001 | Auth stub — replace X-User-Id header with proper OIDC/JWT validation | `packages/server/src/middleware/auth.ts` |
| — | Drag-and-drop has intermittent bugs noted in commit history | `packages/client/src/pages/CalendarPage.tsx` |
| — | Redis-backed cache planned for Phase 2 | `REDIS_URL` in `.env.example` |

---

## 12. Key Files Quick Reference

| File | Purpose |
|------|---------|
| `constitution.md` | Core principles and governance — source of truth |
| `AGENTS.md` | Developer + agent guide with code examples |
| `specs/001-meal-planner/spec.md` | Feature requirements |
| `specs/001-meal-planner/plan.md` | Implementation plan |
| `agents/meal-recommender/instructions/` | Claude system prompt for meal AI |
| `packages/server/src/lib/expiration.ts` | Expiration status logic (midnight cutoff) |
| `packages/server/src/lib/errors.ts` | Problem JSON error helpers |
| `.env.example` | All environment variables documented |
