# Phase C-bis — End-to-End Smoke Test (Next.js backend)

Manual / live validation for the Next.js Route Handler backend (the Express→Next
migration, Cb0–Cb5). It exercises the running app the way the automated suites
**can't**, and was the gate for retiring Express.

> **Scope:** `impl/nextjs` only. The automated tests (server **199** Jest + client
> **258** Vitest) cover logic in isolation; this validates the *integrated, running*
> system.

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

## Mode A — API smoke (headless, ~1 min + agent time)

```bash
bash packages/client/scripts/smoke-test.sh
```

Expected (10 checks, `pass=10 fail=0`): inventory POST `201` → GET `200` → meal-plan entry
`201` → inventory consumed (Chicken **3→2**) → grocery list lazily generated → meal-plan `200`
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
| 5 | **Grocery List** | Auto-generated from the plan — *missing* ingredients, categorised (Dairy/Pantry), "From: <meal>" |

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

---

## Running this with Claude Code

You can ask Claude to perform the whole thing. Claude uses the **Preview MCP** (manages
the dev server from `.claude/launch.json`) for the UI and **Bash + curl** for the API.

**Example prompts:**
- *"Spin up the Next.js app and run the API smoke test."*
  → Claude ensures the Docker services are up, writes `packages/client/.env.local`
  (`MONGODB_URI` to a demo DB + `HOLODECK_URL`), starts the server
  (`preview_start` on the `fridge-nextjs` config), runs `packages/client/scripts/smoke-test.sh`,
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
