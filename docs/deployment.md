# Production Deployment — `impl/nextjs` (Phase E)

Per-branch runbook for shipping **`impl/nextjs`** to production with **gated CI/CD**,
**without merging to `main`**. Tracks the Phase E task list in `ROADMAP_PROGRESS.md`.

> **Branch model:** `main` stays the shared contract; `impl/nextjs` is long-lived and
> deployed directly. **Release = a `nextjs-v*` tag cut from `impl/nextjs`** — no PR to `main`,
> no merge. Image/release versions trace to the branch + SHA.

## Runtime topology

```
                      ┌──────────────── TLS / ingress (your domain) ────────────────┐
   users ── https ──▶ │  Next.js standalone container  (1 process, :3000)           │
                      │  • UI (app/) + API (app/api/v1 Route Handlers + src/server)  │
                      └───────┬───────────────────────────────┬────────────────────┘
                              │ MONGODB_URI (TLS, private)     │ HOLODECK_URL (private)
                      ┌───────▼────────┐               ┌───────▼─────────────────────┐
                      │ MongoDB Atlas  │               │ Holodeck agent sidecar      │
                      │ (managed)      │               │ (ghcr.io/.../fridge-planner)│
                      └────────────────┘               └──────────┬──────────────────┘
                              ▲ OIDC token validation             │ LLM (Anthropic/OpenAI)
                      ┌───────┴────────┐                  ┌────────▼────────┐
                      │ OIDC IdP       │  (issues tokens) │ Anthropic /     │
                      │ (Auth0/Okta/…) │                  │ OpenAI          │
                      └────────────────┘                  └─────────────────┘
```

- The app is the **whole stack** (`output: 'standalone'`, `packages/client/Dockerfile`). It talks
  to Mongo + Holodeck directly. No Express, no proxy.
- **Recommended host: Cloud Run** — matches the agent's existing GCP target and allows the
  recommendations route's **240 s** request timeout. ⚠ **Vercel won't work** (function timeout
  can't cover the long agent call; standalone + sidecar doesn't fit). ECS/Fargate, Fly.io, or k8s
  also work if the request timeout is configurable.

---

## Prerequisites checklist

### Domain & TLS
- [ ] Registered domain + DNS zone (e.g. `fridgeplanner.com`)
- [ ] App hostname (e.g. `app.fridgeplanner.com`) → A/AAAA/CNAME to the host/LB
- [ ] TLS cert: managed (Cloud Run / ACM / `cert-manager`+Let's Encrypt) **or** BYO; force HTTPS + HSTS

### Identity (OIDC) — **the critical dependency**
- [ ] IdP chosen: Auth0 / Okta / AWS Cognito / Entra ID / Keycloak
- [ ] App (client) registration; **RS256** signing
- [ ] Values for env: `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URI` (the `.well-known/jwks.json`)
- [ ] Allowed redirect/callback URIs for the SPA login (needed by **E0**)
- [ ] A test user / client-credentials app to mint tokens for the post-deploy smoke

### Container registry & host
- [ ] Registry: GHCR or Google Artifact Registry; CI push identity via cloud **OIDC federation** (no long-lived keys)
- [ ] Host project/region; CPU/memory; **request timeout ≥ 240 s**; min/max instances; concurrency

### Database
- [ ] MongoDB Atlas cluster (right tier/region); automated backups + PITR
- [ ] Least-privilege DB user; **`MONGODB_URI`** (SRV, TLS)
- [ ] Network: VPC peering / private endpoint (preferred) or IP allowlist for the host egress

### AI agent
- [ ] Holodeck sidecar deployed (`ghcr.io/emtabiraobarias/fridge-planner`) on a **private** address
- [ ] **`HOLODECK_URL`** reachable from the app
- [ ] LLM secret for the agent: `CLAUDE_CODE_OAUTH_TOKEN` **or** `ANTHROPIC_API_KEY` (+ optional `OPENAI_API_KEY` fallback)

### Secrets & prod env (in a secret manager — **never** in the image)
- [ ] `NODE_ENV=production`
- [ ] `AUTH_MODE=oidc` — and **do NOT set `AUTH_ALLOW_DEV`** (E2E-only flag; in prod it would re-open the `X-User-Id` dev seam)
- [ ] `MONGODB_URI`, `HOLODECK_URL`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URI`, LLM key(s), `LOG_LEVEL=info`
- [ ] GitHub Actions secrets mirroring the above, scoped to a protected `production` Environment

### Observability & ops
- [ ] Health checks → public **`/api/health`**; uptime monitor
- [ ] Centralized logs + error tracking (e.g. Sentry); optional OTLP collector (agent exports traces/metrics)
- [ ] Rollback path (previous image digest) + an incident runbook

---

## Task specifics (E0–E7)

### E0 — Auth client wiring ⚠ **BLOCKER** (per-branch frontend)
The SPA used to send **no `Authorization` header** (only the dev `X-User-Id` seam existed). Under
`AUTH_MODE=oidc`, every `/api/v1` call → 401 → users were stuck on the `AuthBanner`. Split into **E0a**
(testable now) and **E0b** (needs a live IdP, deferred to E3).

**E0a — token-bearing client + login redirect ✅ DONE** (commit on `impl/nextjs`)
- `src/services/http.ts`: added a token store (`setAuthToken`/`getAuthToken`) + `apiFetch(input, init)`
  that attaches `Authorization: Bearer <token>` to every request. All 15 service calls in
  `src/services/{inventory,meal-plans,grocery-lists}.ts` now route through `apiFetch`.
- `src/context/AuthContext.tsx`: `AuthProvider`/`useAuth` hold the access token (sessionStorage-backed,
  synced to the service layer), expose `login()` (redirect to the OIDC `authorize` endpoint built from
  `NEXT_PUBLIC_OIDC_*`), `logout()`, and `setToken()`. Mounted outermost in `app/providers.tsx`.
- `src/components/shared/AuthBanner.tsx`: the 401 banner now renders a **Sign in** button wired to
  `useAuth().login`.
- Tests (9, all green): `apiFetch` Bearer attachment (`tests/services/http.test.ts`); `buildAuthorizeUrl`
  + token sync + login redirect (`tests/context/AuthContext.test.tsx`); AuthBanner Sign-in → login
  (`tests/components/AuthBanner.test.tsx`). Lint + `next build` clean; coverage 93%.

**E0b — IdP callback code→token exchange ⏳ DEFERRED → E3** (needs a live IdP)
- `/auth/callback` route: handle the OIDC `code` → token exchange (PKCE), then `setToken(accessToken)`.
- Token refresh/expiry handling on top of the existing 401 → re-login signal.
- Configure `NEXT_PUBLIC_OIDC_ISSUER` / `_CLIENT_ID` / `_REDIRECT_URI` against the real IdP (E3).
- *Out of scope for spec `002`* → small Phase-E feature slice (consider a `003` mini-spec).

### E1 — CI workflow (gate) — `.github/workflows/ci-nextjs.yml`
- Trigger: `on: push/pull_request` for `impl/nextjs`.
- Steps: `npm ci` → `npm run lint` → `npm test` → `bash scripts/validate-e2e.sh --no-agent`.
- Provide MongoDB via a **service container** (`mongo:7`), `MONGODB_URI` pointed at it. No IdP needed
  (the smoke runs the dev seam). Live-agent E2E stays out of CI (nightly/manual).
- Branch protection on `impl/nextjs` requires this check green.

### E2 — CD workflow (gated) — `.github/workflows/deploy-nextjs.yml`
- Trigger: `on: push: tags: ['nextjs-v*']`.
- Build `packages/client/Dockerfile` → tag `:<version>` + `:sha-<short>` → push (digest-pinned).
- `environment: production` (**required reviewers = the gate**) → deploy the image to the host,
  injecting prod env from secrets.
- **Post-deploy smoke** against the real URL: `GET /api/health` → 200; `GET /api/v1/inventory` (no
  token) → **401** (confirms oidc enforced); a token-bearing request → 200. Fail → hold/rollback.

### E3 — Infra prerequisites
Stand up everything in the checklist above (domain/TLS, registry, host, Atlas, Holodeck, IdP). Capture
all connection values into the secret store (E4).

### E4 — Secrets & prod env
Load the prod env (checklist) into the secret manager + GH `production` Environment secrets.
**Verify `AUTH_ALLOW_DEV` is unset** in every prod surface.

### E5 — Multi-instance rate limit
The recommendations limiter is **in-memory, per instance** (`src/server/rate-limit.ts`). For >1
instance it's not a global limit. Decide: accept per-instance, or back it with Redis (`REDIS_URL`
placeholder already in `.env.example`). The JWKS cache is also per-instance (fine — re-fetches).
Otherwise the app is **stateless** (state in Mongo) → safe to scale horizontally.

### E6 — Observability
Wire `/api/health` to the platform health probe; ship logs + errors to your stack; add an uptime
monitor; optionally point `OTLP_ENDPOINT` at a collector for the agent's traces.

### E7 — Release
`git tag nextjs-v4.0.0` on `impl/nextjs` → push → CI green → CD builds/pushes → **approve the
`production` gate** → post-deploy smoke passes. **No merge to `main`.** Record the release in
`ROADMAP_PROGRESS.md`.

---

## Top risks
1. **E0 auth wiring** — E0a (token-bearing client + login) is done; **E0b** (the IdP callback
   token exchange) still blocks a human-facing oidc rollout and depends on a live IdP from E3.
2. **Per-instance rate limit** (E5) — not global until Redis-backed.
3. **240 s recommendations timeout** (E3) — constrains host choice (no Vercel).
4. **`AUTH_ALLOW_DEV` in prod** (E4) — must never be set; it re-opens the dev seam.
