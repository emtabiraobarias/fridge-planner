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

**E0b — IdP callback code→token exchange ✅ DONE** (against the live Stage-1 Keycloak)
- `app/auth/callback/page.tsx` + `AuthContext`: full authorization-code + PKCE (S256) flow —
  `login()` redirects to `${issuer}/protocol/openid-connect/auth` with a code challenge + CSRF state;
  the callback exchanges the code (+ verifier) at the token endpoint and `setToken`s the result.
- `NEXT_PUBLIC_OIDC_*` are baked at build time via Dockerfile ARGs + `deploy-nextjs.yml` build-args.
- Post-login 401 race fixed by seeding the token from sessionStorage at `http.ts` module load.
- *(Token refresh on expiry is still a future nicety; the 401 → re-login signal covers expiry for now.)*

### Stage 1 (internal LAN) — ✅ COMPLETE (verified end-to-end)
Deployed to a single Portainer/TrueNAS node; `s8int-smoke` passed (trusted TLS, OIDC login round-trip,
AI recommendations within the timeout, data persists across app restart, no leaked ports, no
`AUTH_ALLOW_DEV`). Realities discovered during bring-up (baked into the artifacts):
- **Three images** back the stack, all built via CI (host can't build): app
  `fridge-planner-client:4.0.0-rc.5`, agent `fridge-planner:latest` (Dockerfile +
  `agent-image.yml`), edge `fridge-planner-caddy:latest` (Caddyfile **baked in** — the TrueNAS daemon
  can't resolve a repo-relative bind mount).
- **Port remap (Option B):** host 80/443 were taken, so Caddy publishes **8080/8443**; `KC_HOSTNAME`
  and `AUTH_ISSUER` carry `:8443` so the token `iss` stays consistent.
- **Agent serve config:** `holodeck serve` substitutes `${VAR}` over the whole file incl. comments, so
  the served image uses `agent.serve.yaml` (no evaluations/observability env refs).
- **Fence-tolerant parsing:** the agent occasionally wraps its JSON in a ```json fence; the client now
  strips it (CLAUDE.md §14).

### E1 — CI workflow (gate) — `.github/workflows/ci-nextjs.yml` ✅ **DONE** (commit `0193e91`)
- Trigger: `on: push` to `impl/nextjs` + `pull_request` targeting it. `concurrency` cancels superseded runs.
- Single `verify` job (Node 20, npm cache): `npm ci` → `npm run lint` → `npm test` → `bash scripts/validate-e2e.sh --no-agent`.
- **MongoDB:** *not* a GitHub `services:` container — `validate-e2e.sh` brings Mongo up itself via
  `docker compose up -d mongodb`, so a service container would clash on `:27017`. The unit/integration
  tests need no external Mongo (in-process `mongodb-memory-server`). `--no-agent` skips Holodeck → **no
  LLM credentials in CI**; live-agent E2E stays manual/nightly.
- Verified locally end-to-end before commit: lint OK · 283 tests pass · e2e smoke 9/9.
- **⏳ Remaining (manual, repo settings):** enable branch protection on `impl/nextjs` requiring the
  `verify` check green before merge. (Can't be done from code — GitHub repo admin step.)

### E2 — CD workflow (gated) — `.github/workflows/deploy-nextjs.yml` 📝 **DRAFT committed** (not yet active)
A reference template is committed; it **fails at the deploy job until E3 infra + E4 secrets exist** (by
design — the banner in the file says so). What it does:
- Trigger: `on: push: tags: ['nextjs-v*']`.
- **build-push** job: build `packages/client/Dockerfile` → push `ghcr.io/.../fridge-planner-client`
  tagged `:<version>` + `:sha-<sha>` (digest-pinned). *(Note the app image is **separate** from the
  Holodeck image `ghcr.io/.../fridge-planner`.)*
- **deploy** job: `environment: production` (**required reviewers = the gate**). For an on-prem/LAN box,
  runs on a **self-hosted runner** labelled `production` doing `docker compose -f docker-compose.prod.yml
  pull/up client`; a commented **SSH-deploy** alternative is included for a publicly-reachable host.
- **Post-deploy smoke** against the real URL: `GET /api/health` → 200; `GET /api/v1/inventory` (no
  token) → **401** (confirms oidc enforced); a token-bearing request → 2xx. Fail → rollback (manual TODO).
- **Still needed before it runs:** a `docker-compose.prod.yml` on the host, the `production` Environment
  + reviewers, GHCR pull access, and the `PRODUCTION_URL` var / `SMOKE_BEARER_TOKEN` secret.

### E3 — Infra prerequisites
Stand up everything in the checklist above (domain/TLS, registry, host, Atlas, Holodeck, IdP). Capture
all connection values into the secret store (E4).

**Single-node internal-LAN variant (current target).** Instead of Cloud Run + Atlas, run the whole
stack on one host reachable only over the LAN. Artifacts committed for this:
- [`docker-compose.prod.yml`](../docker-compose.prod.yml) — Caddy (edge) + app (pulled image) + MongoDB
  (internal, auth on) + Holodeck + Keycloak (+ its Postgres). **Only Caddy publishes host ports (80/443);
  everything else is reachable only on the `fpnet` network.**
- [`deploy/Caddyfile`](../deploy/Caddyfile) — `fridgeplanner.lan` → app, `auth.fridgeplanner.lan` →
  Keycloak; **Stage 1** uses `local_certs` (internal CA, no internet); **Stage 2** drops the global block
  for public Let's Encrypt. 300s upstream timeouts for the recommendations route.
- [`deploy/prod.env.example`](../deploy/prod.env.example) — the required secrets (copy → root-owned
  `.env`, chmod 600).
- **LAN prerequisites:** internal DNS (or `/etc/hosts`) resolving `fridgeplanner.lan` +
  `auth.fridgeplanner.lan` to the host; distribute Caddy's internal-CA root to clients (Stage 1).
- **Keycloak setup:** create the `fridge-planner` realm + a public SPA client (PKCE), redirect URI
  `https://fridgeplanner.lan/auth/callback`, and an audience mapper matching `OIDC_AUDIENCE`.

### E4 — Secrets & prod env
Load the prod env (checklist) into the secret manager + GH `production` Environment secrets. For the
single-node variant, the runtime secrets live in the host `.env` (see `deploy/prod.env.example`); GH
secrets are only needed for the CD job (`SMOKE_BEARER_TOKEN`, GHCR pull).
**Verify `AUTH_ALLOW_DEV` is unset** in every prod surface. Remember `NEXT_PUBLIC_OIDC_*` are **build
args** (E2 build-push), not runtime env.

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
1. ~~**E0 auth wiring**~~ — ✅ RESOLVED: E0a + E0b both done; OIDC login verified against the live
   Stage-1 Keycloak. (Token *refresh* on expiry remains a future nicety.)
2. **Per-instance rate limit** (E5) — not global until Redis-backed.
3. **240 s recommendations timeout** (E3) — constrains host choice (no Vercel).
4. **`AUTH_ALLOW_DEV` in prod** (E4) — must never be set; it re-opens the dev seam.
