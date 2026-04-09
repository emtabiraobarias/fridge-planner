# Fridge Planner

AI-powered meal planning application that helps you track fridge and pantry inventory, get meal recommendations that minimise food waste, and plan your weekly meals.

## Architecture

```
packages/client   — React 18 + Vite + Tailwind CSS (port 5173 / 80)
packages/server   — Express + TypeScript + Mongoose  (port 3001)
agents/meal-recommender — Holodeck AI agent, Claude Sonnet 4.6 (port 8001)
```

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
Requires changing `auth_provider` in `agents/meal-recommender/agent.yaml` back to `api_key` (or removing the field, as `api_key` is the default).

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

> **Note:** The holodeck sidecar requires `ANTHROPIC_API_KEY` set in `.env`. If skipped, the app still works for inventory management — recommendation requests will return an error.

> **Restarting holodeck after agent changes:** The holodeck container mounts `agents/meal-recommender/` at runtime. After updating `agent.yaml` or `instructions/system-prompt.md`, restart the container to pick up the changes:
> ```bash
> docker compose restart holodeck
> ```

### 5. Start the dev servers

```bash
npm run dev
```

This starts both the Express API server (port 3001) and the Vite dev server (port 5173) concurrently. The Vite dev server proxies `/api` requests to the Express backend.

Open **http://localhost:5173** in your browser.

### Individual services

```bash
npm run server    # Express API only (port 3001)
npm run client    # Vite dev server only (port 5173)
```

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

This starts four containers:

| Service | Port | Description |
|---------|------|-------------|
| `mongodb` | 27017 | MongoDB 7 database |
| `holodeck` | 8001 | AI meal recommendation agent |
| `server` | 3001 | Express API |
| `client` | 5173 → 80 | Nginx serving the React SPA |

### 3. Verify

```bash
# Check all services are healthy
docker compose ps

# Test the API
curl http://localhost:3001/health
# → {"status":"ok"}

# Test the client
curl -s http://localhost:5173 | head -5
```

Open **http://localhost:5173** in your browser.

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
│   ├── client/                 # React frontend
│   │   ├── src/
│   │   │   ├── components/
│   │   │   │   ├── inventory/      # InventoryForm, InventoryList
│   │   │   │   └── recommendations/ # RecommendationsPanel, MealCard, DietaryPreferences
│   │   │   ├── context/            # InventoryContext (shared state)
│   │   │   ├── types/              # MealRecommendation interface
│   │   │   └── services/           # API client (fetch wrappers)
│   │   ├── tests/
│   │   ├── Dockerfile
│   │   └── nginx.conf
│   └── server/                 # Express backend
│       ├── src/
│       │   ├── api/v1/             # inventory, recommendations routes
│       │   ├── middleware/         # auth, error-handler, rate-limiter
│       │   ├── models/             # Mongoose schemas
│       │   ├── services/           # holodeck HTTP client
│       │   ├── types/              # MealRecommendation interface
│       │   └── lib/               # expiration logic, error helpers
│       ├── tests/
│       └── Dockerfile
├── agents/
│   └── meal-recommender/       # Holodeck AI agent
│       ├── agent.yaml
│       ├── instructions/
│       └── data/recipes.json
├── docker/
│   └── holodeck.Dockerfile
├── specs/                      # Feature specifications and plans
├── docker-compose.yml
├── .env.example
└── package.json                # Monorepo root (npm workspaces)
```

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/v1/inventory` | List inventory (supports `?category=`, `?status=`, `?page=`, `?limit=`) |
| `POST` | `/api/v1/inventory` | Add inventory item |
| `PUT` | `/api/v1/inventory/:id` | Update inventory item |
| `DELETE` | `/api/v1/inventory/:id` | Delete inventory item |
| `POST` | `/api/v1/recommendations` | Get AI meal recommendations |

**Rate limits:** 100 req/min (default), 10 req/min (recommendations)

## Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `CLAUDE_CODE_OAUTH_TOKEN` | — | Yes (for AI, preferred) | Claude Code OAuth token — auto-set inside Claude Code sessions; use `claude setup-token` outside |
| `ANTHROPIC_API_KEY` | — | Yes (for AI, fallback) | Direct Anthropic API key; requires `auth_provider: api_key` in `agent.yaml` |
| `OPENAI_API_KEY` | — | No | Fallback LLM provider |
| `MONGODB_URI` | `mongodb://localhost:27017/fridge-planner` | No | MongoDB connection string |
| `HOLODECK_URL` | `http://localhost:8001` | No | Holodeck agent sidecar URL |
| `PORT` | `3001` | No | Express server port |
| `CORS_ORIGIN` | `http://localhost:5173` | No | Allowed CORS origin |
| `LOG_LEVEL` | `info` | No | Pino log level |
| `NODE_ENV` | `development` | No | Environment mode |

## License

Private — All rights reserved.
