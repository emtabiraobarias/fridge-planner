# Phase C-bis — End-to-End Smoke Test (Next.js backend)

Manual / live validation for the Next.js Route Handler backend (the Express→Next
migration, Cb0–Cb5). It exercises the running app the way the automated suites
**can't**, and was the gate for retiring Express.

> **Scope:** the automated tests (server **199** Jest + client **258** Vitest) cover
> logic in isolation; this validates the *integrated, running* system.
>
> **Shared vs per-branch:** the smoke **steps** live in the shared
> [`scripts/smoke-test.sh`](../scripts/smoke-test.sh) (on `main`, synced to both impls —
> they share one `/api/v1` contract). Only the **boot** differs, so each impl has its own
> [`scripts/validate-e2e.sh`](../scripts/validate-e2e.sh): `impl/nextjs` boots one Next
> process on `:3000`; `impl/vite` boots Express + the SPA and points `BASE` at `:3001`.
> This doc covers the `impl/nextjs` boot.

---

## What this covers that the automated tests don't

| Automated tests bypass… | …this smoke test exercises |
|---|---|
| Route handlers called as plain functions with synthetic `Request`s | The **real Next.js server**, on-demand route compilation, HTTP |
| `mongodb-memory-server` | A **real MongoDB** via the `globalThis`-cached connection |
| `[id]`/`[weekStart]` passed as `ctx.params` directly | Real **dynamic-segment + query-string** routing |
| `server-only` aliased to a stub | The real bundler's `server-only` enforcement (also via `next build`) |
| Holodeck agent **mocked** (`vi.mock` / stubbed `fetch`) | The **live Holodeck agent** end-to-end (real LLM call) |

---

## Release validation — when to run this

This is the **top of the testing pyramid**: a release gate, not a per-commit test. Run it at:

- **Major version bumps** (e.g. the C-bis 3.x → 4.0.0 architecture change — its first use).
- **`impl/* → main` merges** and any change to the **backend topology or data model**.
- As a **before/after baseline** for a major change: run on the pre-change tag *and* the new
  version — the same user journeys must still pass. (Major changes are where round-trips
  silently break, so this is the highest-value use.)

Keep it **thin** — one happy-path per feature area. The 199 + 258 automated tests own depth;
this owns "does the whole thing stand up and round-trip?"

**Gating guidance:** the **deterministic core** (`--no-agent`) is suitable as a hard gate and
runs anywhere (no LLM needed) — wire it into CI when CI lands (Mongo service container, on
backend-touching PRs + release tags). The **live-agent step** is non-deterministic, so keep it
**report-only** / manual / nightly.

---

## Prerequisites

1. **Docker services** — MongoDB (`:27017`) and, for the live-agent step, Holodeck (`:8001`):
   ```bash
   docker compose up -d mongodb holodeck
   ```
2. **The Next app env** — the app talks to Mongo + Holodeck directly. For local `next dev`,
   put these in `packages/client/.env.local` (gitignored). Use a throwaway DB so you start clean:
   ```
   MONGODB_URI=mongodb://localhost:27017/fridge-planner-demo
   HOLODECK_URL=http://localhost:8001
   ```
   > ⚠ If `HOLODECK_URL` is unset, recommendations **gracefully fall back to popular recipes**
   > (EC-08) instead of calling the agent — correct behaviour, but not the live-agent path.
3. **Start the app:** `npm run dev` (serves the whole app on `http://localhost:3000`; Express is gone).

---

## Mode A — API smoke (headless)

**One-shot (recommended)** — boots a production build + Mongo (+ Holodeck), runs the
smoke, tears down, exits non-zero on failure:

```bash
bash scripts/validate-e2e.sh             # full, incl. live Holodeck agent
bash scripts/validate-e2e.sh --no-agent  # deterministic core only (no Holodeck)
```

**Against an already-running server** (lower-level — you start the stack):

```bash
BASE=http://localhost:3000/api/v1 bash scripts/smoke-test.sh            # full
BASE=http://localhost:3000/api/v1 bash scripts/smoke-test.sh --no-agent # core only
```

Expected (13 checks, `pass=13 fail=0`; 12 with `--no-agent`): inventory POST `201` → GET `200` → meal-plan entry
`201` → inventory consumed (Chicken **3→2**) → grocery list lazily generated → checkout finalizes remaining receipt-less grocery lines into inventory → meal-plan `200`
→ empty-user recommendations `fallback=popular` → **live-agent recommendations `200`** →
DELETE `204` → bad-ObjectId PUT `400`.

> **On step 8 (live agent):** the check is the `200` and that the route drives the real
> agent client. The agent is **non-deterministic** — a healthy call prints `fallback=(none)`
> with real LLM meals, but a transient agent error/timeout degrades gracefully to
> `fallback=popular` (or `cache`). **Both are correct** — graceful degradation (EC-08) is the
> contract. The script passes regardless; it prints the actual `fallback` for visibility.

## Mode B — UI walkthrough (browser, http://localhost:3000)

| Step | Action | Expected |
|---|---|---|
| 1 | **Inventory** → add "Chicken Breast / 3 / lbs / Meat", then "Rice / 2 / cups / Grains" | "2 items" list, each with Edit/Delete |
| 2 | **Get Recommendations** (with Holodeck up) | "Thinking…" → real AI meal cards with photos (e.g. *Chicken Fried Rice*) |
| 3 | **Meal Plan** | Weekly grid (Breakfast/Lunch/Dinner/Snack × 7); drag a recommendation card onto a slot |
| 4 | Back to **Inventory** | The planned meal's ingredients are **decremented** (reversible consumption, BUG #7) |
| 5 | **Grocery List** | Auto-generated from the plan; ticking a line immediately adds it to Kitchen, and Done shopping finalizes only receipt-less remaining lines |

---

## Results — last run 2026-06-25 (`impl/nextjs`)

**Mode A (API):** `pass=10 fail=0` against a real `next dev` + Mongo. Plus `next build`
compiled all 12 route handlers as dynamic server functions. (On the latest script run the
live-agent step degraded gracefully to `popular`; the UI walkthrough below caught it
returning real meals — both outcomes are valid, see the note above.)

**Mode B (UI):** all journeys passed against the live app —
- Inventory: 2 items added via the form and persisted (survived a server restart).
- **Recommendations: live Holodeck agent returned 5 real meals** (`fallback: none`) —
  *Chicken Fried Rice, Chicken Arroz Caldo, Oven Baked Chicken and Rice, One Pot Mexican
  Chicken and Rice, Ginger Chicken and Rice* — rendered as cards with recipe photos.
- Meal Plan: calendar grid + draggable cards rendered.
- Consumption: planning a meal decremented **Chicken 3→2, Rice 2→1**.
- Grocery List: lazily generated **Eggs (Dairy)** + **Soy Sauce (Pantry)**, "From: Chicken Fried Rice".

This closed the one gap the headless smoke couldn't reach (the **live agent path**) and
satisfied the gate for deleting `packages/server`.

## Phase D auth — UI demonstration (2026-06-27, `impl/nextjs`)

Driven as a user in the browser via the Preview MCP, against a live `next dev` + Mongo
(+ Holodeck). Demonstrates spec `002` (OIDC auth) end-to-end through the UI.

**Part A — `AUTH_MODE=dev` (the X-User-Id seam, default for local dev):**
- App loads cleanly, **no auth banner** — the dev seam resolves the request as `anonymous`.
- Added "Chicken Breast / 3 / lbs / Meat" via the form → persisted (**authenticated write
  succeeded transparently**); recommendations auto-prefetched ("Thinking…" → live agent).
- Confirms FR-D-007: the dev seam keeps the app fully usable with no IdP/token.

**Part B — `AUTH_MODE=oidc` (real enforcement; browser sends no token):**
- On load, every `/api/v1` call is rejected `401`, so the SPA shows:
  - the **amber `AuthBanner`** at the top — *"Your session has expired — please sign in to
    continue."* (FR-D-009 — a re-auth prompt, not a silent/generic failure), and
  - **"Failed to load inventory"** + an empty list (data never loads without a valid token).
- Backing API responses (curl, same server):
  - `GET /api/v1/inventory` (no token) → **401** `{"type":".../unauthorized","title":"Unauthorized","status":401,"detail":"Missing bearer token"}` (RFC-7807) — AUTH-US2-S1 / SC-D-001
  - `GET /api/v1/inventory` (`Authorization: Bearer not-a-jwt`) → **401** — invalid token rejected
  - `GET /api/health` → **200** `{"status":"ok"}` — public, no auth (FR-D-006) / AUTH-US2-S2

> Scenarios exercised live: **AUTH-US1-S1** (dev write), **AUTH-US2-S1/S2** (401 / public health),
> **AUTH-UX-1** (FR-D-009 banner), and the **dev↔oidc** mode switch (FR-D-007). The cross-user-404
> (AUTH-US3) and token-`sub` scoping paths are covered by the automated handler/integration suites
> (a real OIDC login to mint a browser token is out of scope for `002`).

---

## Running this with Claude Code

You can ask Claude to perform the whole thing. Claude uses the **Preview MCP** (manages
the dev server from `.claude/launch.json`) for the UI and **Bash + curl** for the API.

**Example prompts:**
- *"Run the E2E release validation."*
  → Claude ensures Docker is up and runs `bash scripts/validate-e2e.sh` (production build →
  smoke → teardown), reporting pass/fail.
- *"Spin up the Next.js app and run the API smoke test."*
  → Claude ensures the Docker services are up, writes `packages/client/.env.local`
  (`MONGODB_URI` to a demo DB + `HOLODECK_URL`), starts the server
  (`preview_start` on the `fridge-nextjs` config), runs `scripts/smoke-test.sh`,
  reports pass/fail, then tears down.
- *"Demonstrate the app as a user with screenshots."*
  → Claude drives the UI with the Preview tools — `preview_fill`/`preview_click` to add
  inventory and request recommendations, `preview_screenshot` at each step, navigating
  Inventory → Meal Plan → Grocery List.

**What Claude needs:** Docker running (MongoDB + Holodeck), and `.claude/launch.json` with a
config that runs `npm run dev` on port 3000 (already present as `fridge-nextjs`).

---

## Cleanup

```bash
# stop the dev server (kill whatever is on :3000)
kill "$(lsof -tiTCP:3000 -sTCP:LISTEN)" 2>/dev/null
# drop the throwaway demo DB
docker exec fridge-planner-mongodb-1 mongosh --quiet \
  --eval "db.getSiblingDB('fridge-planner-demo').dropDatabase()"
# remove the local env override (so dev returns to the default DB)
rm -f packages/client/.env.local
```
