# Fridge Planner

AI-powered meal planning application that helps you track fridge and pantry inventory, get meal recommendations that minimise food waste, and plan your weekly meals.

## Architecture

```
packages/client   — React 18 + Next.js 15 (App Router) + Tailwind CSS — the WHOLE app (port 3000)
                    UI under app/ + src/; the API under app/api/v1/ (Route Handlers) + src/server/
agents/meal-recommender — Holodeck AI agent, Claude Sonnet 4.6 (port 8001)
```

The Next.js app is the entire stack: it serves the UI **and** the `/api/v1` backend from
Route Handlers in one Node process, talking to MongoDB and Holodeck directly (no separate
Express service — retired in Phase C-bis).

**Backing services:** MongoDB 7

## Prerequisites

- Node.js >= 20.0.0
- npm >= 10.0.0
- Docker and Docker Compose (for MongoDB and deployment)
- An [Anthropic API key](https://console.anthropic.com/) (for AI recommendations)

## Quick Start (Local Development)

### 1. Clone and install

```bash
git clone <repo-url> fridge-planner
cd fridge-planner
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and set one of the following for the AI agent:

**Option A — Claude Code OAuth token (no API key needed):**
```
CLAUDE_CODE_OAUTH_TOKEN=<auto-set inside a Claude Code session>
```
Inside a Claude Code session `CLAUDE_CODE_OAUTH_TOKEN` is already present in the environment — just export it before starting Docker services. Outside Claude Code, run `claude setup-token` to generate one.

**Option B — Direct Anthropic API key:**
```
ANTHROPIC_API_KEY=sk-ant-...
```
Holodeck will fall back to the API key automatically when `CLAUDE_CODE_OAUTH_TOKEN` is absent — no changes to `agent.yaml` needed.

All other values have sensible defaults for local development.

### 3. Start MongoDB

```bash
docker compose up mongodb -d
```

Wait for the health check to pass:

```bash
docker compose ps   # should show mongodb as "healthy"
```

### 4. Start the AI agent (optional)

The holodeck meal-recommender agent powers the AI recommendations. If you want recommendations to work locally:

```bash
docker compose up holodeck -d
```

> **Note:** The holodeck sidecar requires either `CLAUDE_CODE_OAUTH_TOKEN` or `ANTHROPIC_API_KEY` set in `.env`. If skipped, the app still works for inventory management — recommendation requests will return an error.

> **Restarting holodeck after agent changes:** The holodeck container mounts `agents/meal-recommender/` at runtime. After updating `agent.yaml` or `instructions/system-prompt.md`, restart the container to pick up the changes:
> ```bash
> docker compose restart holodeck
> ```

### 5. Start the app

The Next.js app reads `MONGODB_URI` + `HOLODECK_URL` from its **own** env (not the root `.env`),
so put them in `packages/client/.env.local` (gitignored):

```bash
printf 'MONGODB_URI=mongodb://localhost:27017/fridge-planner\nHOLODECK_URL=http://localhost:8001\n' \
  > packages/client/.env.local
```

```bash
npm run dev
```

This starts the Next.js app on port 3000 — it serves the UI **and** the `/api/v1` API (Route
Handlers) in one process (no separate Express server, no proxy).

Open **http://localhost:3000** in your browser.

### End-to-end validation

```bash
bash scripts/validate-e2e.sh --no-agent   # boots a prod build + Mongo, runs the smoke, tears down
```

See [`smoke-test.md`](smoke-test.md) for the full release-gate guide.

### Running tests

```bash
npm run test      # Run all tests (server + client) with coverage
npm run lint      # ESLint with zero warnings
npm run format    # Prettier formatting
```

## Server Deployment (Docker Compose)

### 1. Configure environment

```bash
cp .env.example .env
```

Set the required production values:

```bash
# Required — choose one auth method for the holodeck AI agent:
CLAUDE_CODE_OAUTH_TOKEN=   # preferred: no API key needed (see local dev notes)
# ANTHROPIC_API_KEY=sk-ant-...  # alternative: direct API key

# Optional — override defaults
NODE_ENV=production
LOG_LEVEL=info

# OAuth (when ready — currently uses dev auth stub)
# AUTH_ISSUER=https://your-auth-provider.com
# AUTH_AUDIENCE=fridge-planner-api
# AUTH_JWKS_URI=https://your-auth-provider.com/.well-known/jwks.json
```

### 2. Build and start all services

```bash
docker compose up --build -d
```

This starts three containers:

| Service | Port | Description |
|---------|------|-------------|
| `mongodb` | 27017 | MongoDB 7 database |
| `holodeck` | 8001 | AI meal recommendation agent |
| `client` | 3000 | Next.js app — serves the UI **and** the `/api/v1` API |

### 3. Verify

```bash
# Check all services are healthy
docker compose ps

# Test the API (served by the Next app)
curl -s http://localhost:3000/api/v1/inventory -H 'X-User-Id: dev'
# → {"items":[],"summary":{...},"pagination":{...}}

# Test the client
curl -s http://localhost:3000 | head -5
```

Open **http://localhost:3000** in your browser.

### 4. View logs

```bash
docker compose logs -f            # all services
docker compose logs -f server     # API server only
docker compose logs -f holodeck   # AI agent only
```

### 5. Stop

```bash
docker compose down               # stop containers, keep data
docker compose down -v            # stop containers and delete volumes
```

## Project Structure

```
fridge-planner/
├── packages/
│   ├── client/                 # React frontend (Next.js 15 App Router)
│   │   ├── app/                    # App Router: layout, providers, nav, routes (/, /calendar, /grocery)
│   │   │   └── api/v1/             # Route Handlers (the backend): inventory, grocery-lists, meal-plans, recommendations
│   │   ├── src/
│   │   │   ├── server/            # SERVER LAYER (node-only): db, auth, http, route-helpers, rate-limit, logger,
│   │   │   │                      #   controllers/, models/, services/, lib/, types/
│   │   │   ├── components/
│   │   │   │   ├── calendar/       # WeeklyCalendar, CalendarSlot, CalendarMealCard, MealSlotCard, MealDetailModal
│   │   │   │   ├── grocery/        # AddGroceryItemForm, GroceryListHeader, GroceryListCategoryGroup,
│   │   │   │   │                   # GroceryListItemRow, GroceryListSearchBar, CheckoutConfirmModal
│   │   │   │   ├── inventory/      # InventoryForm, InventoryList
│   │   │   │   ├── recommendations/ # RecommendationsPanel, MealCard, DraggableMealCard
│   │   │   │   └── shared/
│   │   │   ├── context/            # InventoryContext, MealPlanContext, RecommendationsContext, GroceryListContext
│   │   │   ├── views/              # InventoryPage, CalendarPage, GroceryListPage
│   │   │   ├── services/           # inventory.ts, meal-plans.ts, grocery-lists.ts (API fetch wrappers)
│   │   │   ├── types/              # meal-plan.ts, meal-recommendation.ts, grocery-list.ts
│   │   │   └── lib/                # date-utils.ts
│   │   ├── tests/                  # Vitest — components/, context/, views/, app/, + tests/server/ (node-env API tests)
│   │   ├── next.config.ts
│   │   └── Dockerfile
├── scripts/                    # smoke-test.sh (shared) + validate-e2e.sh (per-branch E2E gate)
├── agents/
│   └── meal-recommender/       # Holodeck AI agent
│       ├── agent.yaml          # Model, eval metrics, test cases
│       └── instructions/       # system-prompt.md
├── specs/                      # Feature specifications (spec.md, plan.md, checklists/)
├── .specify/                   # Spec-first workflow templates and scripts
├── docker-compose.yml
├── .env.example
└── package.json                # Monorepo root (npm workspaces)
```

## API Endpoints

Base URL: `http://localhost:3000/api/v1` (served by the Next.js app — same origin, no proxy)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check (no prefix) |
| `GET` | `/inventory` | List items (`?category=`, `?status=`, `?page=`, `?limit=`) |
| `POST` | `/inventory` | Add inventory item |
| `PUT` | `/inventory/:id` | Update inventory item |
| `DELETE` | `/inventory/:id` | Delete inventory item |
| `POST` | `/recommendations` | Get AI meal suggestions (no body required) |
| `GET` | `/meal-plans?weekStart=<ISO>` | Fetch weekly meal plan |
| `POST` | `/meal-plans/:weekStart/entries` | Add a meal entry to a slot |
| `PUT` | `/meal-plans/:weekStart` | Replace full entries array |
| `DELETE` | `/meal-plans/:weekStart/entries/:slotId` | Remove a meal entry |
| `GET` | `/grocery-lists/:weekStart` | Fetch list; lazily generates from meal plan if none exists |
| `POST` | `/grocery-lists/:weekStart/generate` | Force-regenerate list (preserves manually-added items) |
| `POST` | `/grocery-lists/:weekStart/items` | Add a manual item |
| `PATCH` | `/grocery-lists/:weekStart/items/:itemId` | Update item (checked state, quantity, etc.) |
| `DELETE` | `/grocery-lists/:weekStart/items/:itemId` | Remove item |
| `POST` | `/grocery-lists/:weekStart/complete` | Checkout — add purchased items to inventory |

**Rate limits:** 100 req/min (default), 10 req/min (`/recommendations`)

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Yes (for AI, preferred) | Claude Code OAuth token — auto-set inside Claude Code sessions; use `claude setup-token` outside |
| `ANTHROPIC_API_KEY` | — | Yes (for AI, fallback) | Direct Anthropic API key; used automatically when `CLAUDE_CODE_OAUTH_TOKEN` is absent |
| `OPENAI_API_KEY` | — | No | Fallback if Anthropic provider unavailable in Holodeck |
| `MONGODB_URI` | `mongodb://localhost:27017/fridge-planner` | No | MongoDB connection string |
| `HOLODECK_URL` | `http://localhost:8001` | No | Holodeck agent sidecar URL |
| `AUTH_MODE` | `dev` | No | `dev` = trust `X-User-Id` (local dev + tests); `oidc` = validate JWTs (required in production). Spec 002 / Phase D. |
| `AUTH_ISSUER` | — | oidc | OIDC issuer URL (required when `AUTH_MODE=oidc`) |
| `AUTH_AUDIENCE` | — | oidc | OIDC audience (required when `AUTH_MODE=oidc`) |
| `AUTH_JWKS_URI` | — | oidc | OIDC JWKS endpoint (required when `AUTH_MODE=oidc`) |
| `LOG_LEVEL` | `info` | No | Log level |
| `NODE_ENV` | `development` | No | Environment mode |
| `REDIS_URL` | `redis://localhost:6379` | No | Redis cache (P2+, not required for P1 MVP) |

## Feature Specification Workflow

New features follow a **spec-first** process. Templates live in `.specify/templates/`; the workflow is driven by Claude Code slash commands in `.claude/commands/`.

### New Features

1. **Scaffold:** Run `.specify/scripts/bash/create-new-feature.sh` with the feature name.
2. **Write `spec.md`:** Run `/speckit.specify` — Claude clarifies requirements and writes the spec. Each user story must be independently testable.
3. **Write `plan.md`:** Run `/speckit.plan` — architecture decisions, component design, API changes, phase breakdown.
4. **Write `tasks.md`:** Run `/speckit.tasks` — implementation checklist derived from spec and plan.
5. **Analyse:** Run `/speckit.analyze` — cross-checks spec, plan, and tasks for gaps before coding starts.
6. **Implement:** Work through `tasks.md`, checking off items as you go.

### Bug Fixes (ensuring spec adherence)

A bug is a **code failure** to meet an existing spec requirement — the spec itself does not change.

1. **Locate the violated requirement** — find the acceptance scenario and `FR-XXX` in `specs/<feature>/spec.md` that the defect contradicts. If no FR covers it, the spec is incomplete → treat as a spec tweak (see below).
2. **Write a failing test** — cite the FR number in the test name: `it('excludes items expiring today (FR-007)', ...)`.
3. **Fix the code** — make the test pass without touching spec, plan, or tasks.
4. **Commit** referencing the FR: `fix: midnight cutoff off-by-one (FR-007)`.

> If you find yourself wanting to change the spec to match what the code does, stop — that is a spec tweak, not a bug fix.

### Spec Tweaks (cascading updates)

When a requirement itself changes, update files in strict cascade order:

| Step | File | What to update |
|------|------|----------------|
| 1 | `specs/<feature>/spec.md` | Revise the acceptance scenario, `FR-XXX` statement, or `SC-XXX` metric |
| 2 | *(run `/speckit.analyze`)* | Surfaces gaps in plan and tasks caused by the spec change |
| 3 | `specs/<feature>/plan.md` | Update Technical Context, Constitution Check, or phase breakdown if approach changes |
| 4 | `specs/<feature>/tasks.md` | Add, remove, or reorder tasks to match the revised plan |
| 5 | `specs/<feature>/checklists/` | Add or remove checklist items if validation criteria changed |
| 6 | `.specify/memory/constitution.md` | Amend only if the change requires a new constitutional principle; increment version |

After updating the spec, any existing code that no longer satisfies the revised requirement becomes a bug — apply the bug-fix workflow above.

**Deciding which workflow applies:**
- "The code is wrong for what we originally intended" → **Bug fix** (code changes only)
- "What we intended has changed" → **Spec tweak** (spec → plan → tasks → code)

## License

Private — All rights reserved.
