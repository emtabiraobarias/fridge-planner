# Implementation Plan: Smart Meal Planner with AI-Powered Recommendations

**Branch**: `001-meal-planner` | **Date**: 2026-03-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-meal-planner/spec.md`

## Summary

Build a full-stack meal planning web application with three priority tiers: (P1) fridge/pantry inventory tracking with AI meal recommendations via a holodeck-agents sidecar, (P2) a drag-and-drop weekly meal planning calendar, and (P3) a smart grocery list with ingredient aggregation and unit normalisation. The AI recommendation component delegates to a holodeck-agents HTTP sidecar service running a YAML-configured Claude Sonnet 4.6 agent, called over REST from the Express backend.

## Technical Context

**Language/Version**: TypeScript 5.x (strict); Node.js 20 LTS (backend); React 18 (frontend)
**Primary Dependencies**: Express 4, Mongoose 8, Vite 5, Tailwind CSS 3, holodeck-agents (sidecar, Python-based CLI)
**Storage**: MongoDB (primary datastore), ChromaDB (recipe vectorstore inside holodeck sidecar), Redis (caching — P2+)
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
┌──────────────────────┐    POST /chat/sync     ┌───────────────────────────┐
│  Express API         │ ─────────────────────► │  holodeck serve           │
│  packages/server     │ ◄───────────────────── │  agents/meal-recommender  │
│  :3000               │  { content: "..." }    │  :8001 (REST protocol)    │
└──────────────────────┘                        └───────────────────────────┘
                                                         │
                                                         ▼
                                                  ChromaDB (recipes)
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

tools:
  - type: vectorstore
    name: recipe_search
    description: Search recipe database by available ingredients
    source: data/recipes.json
    embedding_model: text-embedding-3-small
    database: chromadb
    top_k: 5
    chunk_size: 512
    chunk_overlap: 64
    min_similarity_score: 0.7

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
interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  expiresAt: string; // ISO 8601 date
}

export async function getMealRecommendations(
  ingredients: Ingredient[]
): Promise<string> {
  const message = [
    'Suggest 3-5 meals I can make with these ingredients.',
    'Prioritise ingredients expiring soonest.',
    '',
    ...ingredients.map(
      i => `- ${i.quantity} ${i.unit} ${i.name} (expires: ${i.expiresAt})`
    ),
  ].join('\n');

  const res = await fetch(`${process.env.HOLODECK_URL}/chat/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) throw new Error(`Holodeck error: ${res.status}`);
  const data = await res.json();
  return data.content;
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
├── docker-compose.yml                 # mongodb + chromadb + holodeck + server + client
└── .env.example
```

---

## Implementation Phases

### Phase 0 — Scaffolding & Verification (prerequisite)

1. Verify holodeck serve supports Anthropic/Claude (run `legal-assistant` sample locally)
2. Scaffold monorepo: `packages/client`, `packages/server`, workspace `package.json`
3. Configure ESLint, Prettier, and pre-commit hooks
4. Set up `docker-compose.yml` with MongoDB, ChromaDB, holodeck sidecar, server, client
5. Create `.env.example` with all required environment variables

### Phase 1 — P1: Inventory + AI Recommendations (MVP)

**Backend first (TDD)**:
1. Mongoose `Ingredient` schema (name, quantity, unit, category, expiresAt, location)
2. Inventory CRUD API (`/api/v1/inventory`) with OpenAPI 3.0 spec
3. Expiration tracking — midnight cutoff logic (yellow ≤3 days, red = expired)
4. holodeck agent (`agents/meal-recommender/`) with seed recipe dataset
5. Recommendations endpoint (`POST /api/v1/recommendations`) — calls holodeck sidecar
6. OAuth 2.0/OIDC middleware protecting all routes

**Frontend**:
7. Inventory list view with expiration colour coding
8. Add/edit ingredient form
9. AI recommendation panel (calls recommendations endpoint)
10. Dietary preference settings (passed as context to agent)

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
- [ ] **Codebase**: Single repository, feature branch `001-meal-planner` created ✓
- [ ] **Dependencies**: All dependencies declared in `package.json` (npm workspaces) and holodeck `agent.yaml`
- [ ] **Config**: `HOLODECK_URL`, `ANTHROPIC_API_KEY`, `MONGODB_URI`, `REDIS_URL`, `AUTH_ISSUER` via env vars
- [ ] **Backing Services**: MongoDB, Redis, ChromaDB, holodeck sidecar all accessed via config URLs
- [ ] **Build/Release/Run**: Vite build (client), tsc (server), holodeck serve (agent) — separated
- [ ] **Processes**: Express is stateless; sessions in Redis; no in-memory state
- [ ] **Port Binding**: Client (:5173 dev / :80 prod), Server (:3000), holodeck (:8001) — all configurable
- [ ] **Concurrency**: Horizontally scalable Express processes; holodeck sidecar independent
- [ ] **Disposability**: Express SIGTERM handler; graceful shutdown with connection draining
- [ ] **Dev/Prod Parity**: docker-compose for all backing services in dev
- [ ] **Logs**: Structured JSON to stdout/stderr (pino for Express)
- [ ] **Admin Processes**: DB migrations and seed scripts as npm scripts

**Security Requirements**:
- [ ] OAuth 2.0/OIDC authentication for all API endpoints
- [ ] JWT token validation with signature verification
- [ ] RBAC implementation with granular permissions
- [ ] API key support for holodeck sidecar with rate limiting
- [ ] HTTPS enforcement (TLS 1.3 minimum)
- [ ] Security headers configured (CSP, X-Frame-Options, etc.)

**Testing Standards**:
- [ ] TDD approach: Tests written before implementation
- [ ] Minimum 80% backend coverage, 70% frontend coverage
- [ ] Unit tests for business logic (expiration logic, unit normalisation)
- [ ] Integration tests for API contracts
- [ ] E2E tests for critical user journeys (add ingredient → get recommendation)
- [ ] holodeck evaluation tests for recommendation quality (faithfulness ≥ 0.8)
- [ ] CI/CD pipeline configured to block failing tests

**Performance Requirements**:
- [ ] API p95 latency < 200ms (excluding recommendation endpoint — AI latency acceptable at < 5s)
- [ ] Frontend TTI < 3s on 3G
- [ ] Responsive design: 320px to 1920px
- [ ] WCAG 2.1 AA accessibility compliance
- [ ] MongoDB indexes on `expiresAt`, `category`, `userId`
- [ ] Redis caching for recommendation results (TTL: 5 minutes per ingredient set)

**API-First Architecture**:
- [ ] OpenAPI 3.0 specification for all endpoints
- [ ] API versioning: `/api/v1/...`
- [ ] RFC 7807 error responses (holodeck also uses this format natively)
- [ ] Rate limiting: 100 req/min default; recommendation endpoint: 10 req/min
- [ ] Pagination for inventory list endpoint
- [ ] CORS policy configured

**Code Quality**:
- [ ] ESLint + TypeScript ESLint configured
- [ ] Prettier configured
- [ ] Pre-commit hooks (lint-staged + husky)
- [ ] Cyclomatic complexity < 10 enforced via ESLint
