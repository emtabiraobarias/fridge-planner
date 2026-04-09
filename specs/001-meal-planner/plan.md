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
| Phase 3 — P3: Smart Grocery List | Not started | |

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
**Primary Dependencies**: Express 4, Mongoose 8, Vite 5, Tailwind CSS 3, holodeck-agents (sidecar, Python-based CLI)
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
│  :3000               │  { message: "[{...}]", ... }        │  :8001 (REST protocol)    │
└──────────────────────┘                                     └───────────────────────────┘
                                                         │
                                                         ▼
                                                  Claude Sonnet 4.6
```

### Agent Definition

```yaml
# agents/meal-recommender/agent.yaml
name: meal-recommender
description: Suggests meals based on fridge inventory, prioritising ingredients expiring soonest

model:
  provider: anthropic
  name: claude-sonnet-4-6
  temperature: 0.5
  max_tokens: 2048

instructions:
  file: instructions/system-prompt.md

evaluations:
  model:
    provider: anthropic
    name: claude-sonnet-4-6
    temperature: 0.0
  metrics:
    - type: rag
      metric_type: faithfulness
      threshold: 0.8
    - type: geval
      name: ExpiryPrioritisation
      criteria: |
        Does the response prioritise meals that use ingredients with the earliest
        expiration dates? Penalise responses that ignore expiry context.
      evaluation_params:
        - input
        - actual_output
      threshold: 0.8
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
  dietaryPreferences: string[] = [],
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

### Known risk to verify before implementation

The holodeck serve docs note: *"Claude Agent SDK backends are not yet supported for `holodeck serve`"* — only Semantic Kernel backends (OpenAI, Azure OpenAI, Ollama) are explicitly listed as compatible. However, the `legal-assistant` sample in `holodeck-samples` uses Claude Sonnet 4.6 successfully. **This must be verified against the installed holodeck version before committing to Anthropic as the provider.** OpenAI `gpt-4o` is the fallback if Claude is blocked.

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
│   ├── client/                        # React 18 + Vite + TypeScript
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── inventory/         # Inventory list, add/edit forms
│   │   │   │   ├── recommendations/   # AI recommendation panel
│   │   │   │   ├── calendar/          # Weekly meal planning (P2)
│   │   │   │   └── grocery/           # Grocery list (P3)
│   │   │   ├── pages/
│   │   │   ├── services/              # API client (fetch wrappers)
│   │   │   ├── context/               # React Context for state
│   │   │   └── main.tsx
│   │   ├── tests/
│   │   └── vite.config.ts
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
│       ├── instructions/
│       │   └── system-prompt.md
│       └── data/
│           └── recipes.json           # seed recipe dataset for vectorstore
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
- [x] holodeck agent (`agents/meal-recommender/`) with seed recipe dataset (25 recipes)
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
- [x] Dietary preference settings with localStorage persistence
- [x] Inventory context provider with shared state management
- [x] App.tsx integration with responsive two-column layout
- [x] Frontend tests passing (RecommendationsPanel + MealCard), >70% coverage

#### Future Improvements (Phase 1 follow-up)

- [ ] **Vectorstore tuning for meal-recommender agent** (`agents/meal-recommender/agent.yaml`):
  - Increase `top_k` from 5 to 10 to surface more candidate recipes before LLM ranking
  - Tune `min_similarity_score` (currently 0.7) based on evaluation metric results
  - Evaluate `chunk_size` (512) and `chunk_overlap` (64) against recipe retrieval faithfulness score
  - Expand `data/recipes.json` beyond current 20 recipes to improve vectorstore coverage

### Phase 2 — P2: Weekly Meal Planning Calendar

1. `MealPlan` Mongoose schema + CRUD API
2. Drag-and-drop weekly calendar UI (React DnD or similar)
3. Assign recommended meals to calendar days
4. Ingredient consumption tracking (deduct from inventory on assignment)

### Phase 3 — P3: Smart Grocery List

1. Grocery list generation from planned meals vs. current inventory
2. Ingredient aggregation with unit normalisation (e.g., 500g + 1kg → 1.5kg)
3. Grocery list CRUD API + UI
4. Export/share grocery list

---

## Constitution Check

**Twelve-Factor App Compliance**:
- [x] **Codebase**: Single repository, feature branch `001-meal-planner`
- [x] **Dependencies**: All dependencies declared in `package.json` (npm workspaces) and holodeck `agent.yaml`
- [x] **Config**: `HOLODECK_URL`, `ANTHROPIC_API_KEY`, `MONGODB_URI`, `CORS_ORIGIN`, `LOG_LEVEL` via env vars
- [x] **Backing Services**: MongoDB, holodeck sidecar all accessed via config URLs
- [x] **Build/Release/Run**: Vite build (client), tsc (server), holodeck serve (agent) — separated
- [x] **Processes**: Express is stateless; no in-memory state
- [x] **Port Binding**: Client (:5173 dev / :80 prod), Server (:3001), holodeck (:8001) — all configurable
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
- [ ] holodeck evaluation tests for recommendation quality (deferred — requires running sidecar)
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
