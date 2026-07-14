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
                              ▲ OIDC token validation             │ LLM (OpenAI)
                      ┌───────┴────────┐                  ┌────────▼────────┐
                      │ OIDC IdP       │  (issues tokens) │ OpenAI          │
                      │ (Auth0/Okta/…) │                  │                 │
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

### AI agents (two Holodeck sidecars — one agent per instance)
- [ ] **Meal-recommender** (`ghcr.io/emtabiraobarias/fridge-planner`, `:8001`) on a **private** address;
      **`HOLODECK_URL`** reachable from the app. Provider = **OpenAI** → needs **`OPENAI_API_KEY`**.
- [ ] **Feedback collector** (`ghcr.io/emtabiraobarias/fridge-planner-feedback`, `:8002`) on a **private**
      address; **`FEEDBACK_AGENT_URL`** reachable from the app. Provider = **OpenAI** → needs
      **`OPENAI_API_KEY`** (same key as the meal-recommender). If down, `/api/v1/feedback` 502s and
      preserves drafts — the rest of the app is unaffected.
- [ ] *(optional)* recipe-URL verification for recommendations: `BRAVE_SEARCH_API_KEY` +
      `SPOONACULAR_API_KEY` on the **app** (not the agent). Unset → meals return without a `recipeUrl`.

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
  (internal, auth on) + **two agents** (`holodeck` meal-rec :8001, `holodeck-feedback` :8002 —
  both OpenAI) + Keycloak (+ its Postgres). **Only Caddy publishes host ports (80/443); everything else is
  reachable only on the `fpnet` network.**
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

## Updating a running deployment (no data loss)

The internal-LAN stack is already live. This is the routine for shipping a **new version** to it
**without wiping data**. All persistent state lives in Docker **named volumes** — the update path
never touches them; only the destructive commands in "What NOT to do" below do.

### What holds the data (must survive every update)
| Volume | Holds | Lost if… |
|---|---|---|
| `mongodb_data` | All app data — inventory, meal plans, grocery lists, **feedback records** | volume removed |
| `keycloak_db_data` | Keycloak realm, users, client config (Postgres) | volume removed |
| `caddy_data` | Caddy **internal CA + issued certs** (re-trusting the CA on every client if lost) | volume removed |
| `caddy_config` | Caddy autosave config | volume removed |

The two agents (`holodeck`, `holodeck-feedback`) are **stateless** — feedback transcripts live in
`mongodb_data`, not in the agent containers — so re-pulling/replacing them never risks data.

### The three images (each versioned independently by a git tag)
| Image | Built by tag | Carries |
|---|---|---|
| `…/fridge-planner-client` (`APP_IMAGE`) | `nextjs-v*` → `deploy-nextjs.yml` | UI + API + **recipe-verifier** |
| `…/fridge-planner` (`AGENT_IMAGE`) | `agent-v*` → `agent-image.yml` | meal-recommender (**OpenAI**) |
| `…/fridge-planner-feedback` (`FEEDBACK_AGENT_IMAGE`) | `agent-feedback-v*` → `agent-feedback-image.yml` | feedback collector (**OpenAI**) |

Only re-tag/rebuild the image(s) that actually changed. A code change under `packages/client/`
→ `nextjs-v*`; a change under `agents/meal-recommender/` → `agent-v*`; under
`agents/feedback-collector/` → `agent-feedback-v*`.

### Standard update procedure

1. **Back up first (belt-and-suspenders — the update itself won't touch data, but do this anyway).**
   On the host, dump Mongo to a file *inside the named volume's reach* or copy it out:
   ```sh
   # App + feedback data
   docker compose -f docker-compose.prod.yml exec -T mongodb \
     mongodump --username "$MONGO_ROOT_USER" --password "$MONGO_ROOT_PASSWORD" \
     --authenticationDatabase admin --archive > mongo-backup-$(date +%F).archive
   # Keycloak Postgres
   docker compose -f docker-compose.prod.yml exec -T keycloak-db \
     pg_dump -U "$KC_DB_USER" "$KC_DB_NAME" > keycloak-backup-$(date +%F).sql
   ```

2. **Publish the new image(s)** by cutting the matching tag(s) from `impl/nextjs` (CI builds +
   pushes to GHCR; the host only pulls):
   ```sh
   git tag nextjs-v4.1.0        && git push origin nextjs-v4.1.0          # app changed
   git tag agent-v1.1.0         && git push origin agent-v1.1.0           # meal-rec agent changed
   git tag agent-feedback-v1.0.0 && git push origin agent-feedback-v1.0.0 # feedback agent changed
   ```
   Wait for the workflow(s) to go green (Actions tab). **Pin to the version tag**, not `:latest`, so
   a redeploy is reproducible.

3. **Update the env** on the host `.env` (Path B) or the Portainer stack env (Path A) to the new
   pinned tags, and add any new keys the release introduced:
   ```
   APP_IMAGE=ghcr.io/emtabiraobarias/fridge-planner-client:4.1.0
   AGENT_IMAGE=ghcr.io/emtabiraobarias/fridge-planner:1.1.0
   FEEDBACK_AGENT_IMAGE=ghcr.io/emtabiraobarias/fridge-planner-feedback:1.0.0
   OPENAI_API_KEY=…            # BOTH agents (meal-recommender + feedback collector)
   BRAVE_SEARCH_API_KEY=…      # optional (recipe-URL verification)
   SPOONACULAR_API_KEY=…       # optional
   ```

4. **Redeploy — a rolling, volume-preserving recreate:**
   - **Portainer (CE, this deployment):** open the stack → **Update the stack** (or **Pull and
     redeploy**) with **"Re-pull image"** enabled and **"Remove volumes" OFF**. Portainer recreates
     only the containers whose image/config changed; named volumes are reused.
   - **Or from a host shell** (self-hosted-runner / SSH):
     ```sh
     cd /opt/fridge-planner
     docker compose -f docker-compose.prod.yml pull            # fetch new image tags
     docker compose -f docker-compose.prod.yml up -d            # recreate changed services only
     ```
     `up -d` **preserves volumes** and leaves unchanged services running. You can scope it to one
     service, e.g. `… up -d app` or `… up -d holodeck`.

5. **Verify** (subset of `s8int-smoke`): `https://fridgeplanner.lan:8443` loads; OIDC login still
   works (Keycloak data intact); a **pre-existing** inventory item / feedback record is still
   present (proves `mongodb_data` survived); recommendations return; `/feedback` gets a reply.

### Rollback
Re-point the tag(s) in the env to the previous version and redeploy (step 4). Because images are
version-pinned and data is in volumes, rollback is just "deploy the old image again" — no data
migration. Keep the last-known-good tags noted in `deploy/state.json`.

### ⛔ What NOT to do (these destroy data)
- **`docker compose -f docker-compose.prod.yml down -v`** — the `-v` deletes the named volumes
  (Mongo, Keycloak, Caddy CA). Use `down` **without** `-v`, or just `up -d` to recreate in place.
- **Portainer → Remove stack with "Remove volumes" checked**, or deleting a volume under
  **Volumes**. Removing the stack *without* the volumes option is recoverable (redeploy re-attaches);
  removing volumes is not.
- **Renaming a volume or the stack/project name** — Docker keys volumes by `<project>_<volume>`, so a
  renamed project silently creates *fresh empty* volumes. Keep the stack name stable.
- **Switching `mongodb_data` to a bind mount** or changing the Mongo `authSource`/root creds without a
  dump+restore.

### Migrating the existing deployment to this release (one-time)
The currently-running stack predates the OpenAI meal-rec + recipe-verifier + feedback-agent changes.
To move it to this version without data loss, do a **normal update** (above) with these specifics:
- Publish **all three** images (`nextjs-v*`, `agent-v*`, `agent-feedback-v*`).
- Add `OPENAI_API_KEY` to the env; neither agent reads `CLAUDE_CODE_OAUTH_TOKEN` /
  `ANTHROPIC_API_KEY` any more (both migrated to the OpenAI provider) — the Claude
  credentials can be removed from the stack env.
- The new `holodeck-feedback` service is **additive** — it starts alongside the others; no existing
  volume or service is replaced. `mongodb_data` (your existing inventory/plans) is untouched.
- **Troubleshooting:** if a (re)built agent image passes `/health` but the first chat turn fails with
  `Agent execution failed: No module named 'agents'`, the image was built without the `openai-agents`
  extra that Holodeck ≥0.7 needs for `provider: openai`. Both agent Dockerfiles install it
  (`pip install "holodeck-ai[openai-agents]==<holodeck version>"`) — rebuild from the current branch.

---

## Top risks
1. ~~**E0 auth wiring**~~ — ✅ RESOLVED: E0a + E0b both done; OIDC login verified against the live
   Stage-1 Keycloak. (Token *refresh* on expiry remains a future nicety.)
2. **Per-instance rate limit** (E5) — not global until Redis-backed.
3. **240 s recommendations timeout** (E3) — constrains host choice (no Vercel).
4. **`AUTH_ALLOW_DEV` in prod** (E4) — must never be set; it re-opens the dev seam.
