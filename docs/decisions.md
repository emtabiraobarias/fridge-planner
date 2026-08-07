# Decision history & background

`CLAUDE.md` states the **rules**. This file records **why** — the migrations, the
superseded decisions, and the incidents that produced those rules. Read it before arguing
with a rule in CLAUDE.md; most of them were bought with an outage or a wasted day.

Branch-scoped to `impl/nextjs`.

---

## Architecture migrations

### Express → Next.js Route Handlers (Phase C-bis)
The API used to be a standalone Express service on `:3001`, with the client proxying to it.
It was retired into Next.js Route Handlers running in the **same process on `:3000`**, and
`packages/server` was deleted. Consequences that still bite:

- Same-origin means **no `PORT`, `CORS_ORIGIN`, or `BACKEND_URL`** anywhere.
- The old Express `NodeNext` module resolution required `.js` extensions on relative
  imports. The server layer is now bundled by Next (`moduleResolution: Bundler`), so imports
  are **extensionless** — the exact opposite rule. Old code and old habits both get this wrong.
- `impl/vite` **still runs Express**. Don't "fix" one branch to match the other.

### Vite → Next.js 15 App Router (`08c9e47`)
The client was fully migrated. `vite.config.ts` is gone, `vitest.config.ts` handles tests
only, and the dev server is `next dev --port 3000` (not Vite's 5173). The Vite
implementation is kept alive **deliberately** on the long-lived `impl/vite` branch — it is
not dead code awaiting cleanup.

### Agents: Claude → OpenAI `gpt-4o`
Both Holodeck agents were migrated off Anthropic to decouple the app from a single vendor;
the Semantic Kernel backend also needs no Node.js runtime, which shrank the images. The
Anthropic-specific `auth_provider: oauth_token` rule in CLAUDE.md §13 is therefore
**dormant, not obsolete** — it applies again the moment an Anthropic agent returns.

---

## Holodeck base-image incidents

**2026-07-11 — `holodeck-base:latest` moved to Debian trixie.** It began **rejecting
`claude.setting_sources`** and **stopped bundling Node.js**. Neither mattered after the
OpenAI migration (no `claude:` block, no Node needed), so the feedback Dockerfile dropped
its `nodejs` install. Recorded in case an Anthropic agent comes back.

**2026-07-14 — Holodeck 0.7.x changed the OpenAI backend.** `provider: openai` now routes
to the **OpenAI Agents SDK** (`import agents`) instead of Semantic Kernel. The
`openai-agents` package is an **optional extra the base image doesn't bundle**, and the
failure mode is nasty: the container passes `/health` (backend init is lazy) and only fails
on the **first chat turn**, with `No module named 'agents'`. Both agent Dockerfiles pin
`pip install "holodeck-ai[openai-agents]==<base's holodeck version>"` because of this.
**Keep that line when touching either Dockerfile.**

---

## Recipe URLs — why the server attaches them (Option A)

Holodeck exposes **no web-search tool for non-Claude providers**, so an agent asked for a
recipe link will simply invent one. The agent is therefore instructed never to author
`recipeUrl`/`imageUrl`, and `src/server/services/recipe-verifier.ts` attaches a URL
server-side **only when a real page is found** — Brave `site:`-restricted search across four
approved domains (panlasangpinoy.com, recipetineats.com, kawalingpinoy.com, taste.com.au),
Spoonacular as fallback, gated on title similarity — otherwise the field is omitted.

**FR-037 (2026-07-15) made it two-phase** because awaiting verification made results feel
broken: `/recommendations` returns the agent's 5–10 candidates immediately, the client then
POSTs `/recommendations/verify-links`, and meals still unlinked when it settles are
**removed**. `POPULAR_RECIPES` fallbacks ship hand-verified links and skip the lazy phase.

---

## CD & rollout — three decisions, each superseding the last

Read this whole section before changing anything about how releases reach production. The
current rule (pin bump = deploy) looks arbitrary without the two failures behind it.

**Decided 2026-07-15 — CI stops at build-push.** Portainer **CE** cannot use stack webhooks
(Business-only), and the prod stack is git-backed, so there is no host compose directory for
a self-hosted runner to operate on. The deploy job was removed from
`.github/workflows/deploy-nextjs.yml`; resurrect it from git history at tag `nextjs-v4.1.1`
if the topology ever changes.

**Decided 2026-07-21 — GitOps polling on `:latest`** *(superseded)*. Rather than a
self-hosted runner or paying for BE, every image defaulted to `:latest`, every release
workflow published `:latest`, and Portainer re-pulled the whole stack on its own interval.
Whole-stack polling had a genuine side benefit: app and agent images roll **together**,
which removes the version-pairing risk that spec 006's release had to sequence by hand.

**Decided 2026-07-27 — explicit version pins in git** *(current)*. The floating tag **was
the defect**. Polling was configured correctly and the stack redeployed on schedule, but
`docker compose up -d` **reuses a locally cached `:latest`** — so release **4.9.0 sat
unshipped for a day while every layer reported success**. Pinning a version in git makes the
git change and the image change the *same event*, and a resolved version tag cannot be
served from cache.

> **Therefore: bumping the pin is the deploy. Rollback is reverting that commit.** And the
> order is load-bearing — tag → CI green → *then* bump, never before the image exists on GHCR.

**Related trap (2026-07-26).** A stale container answers `/api/health` with 200 exactly like
a fresh one, so **200 is not evidence a release landed**. `/api/health` carries the
`version` baked in at build time from the git tag; `scripts/verify-rollout.sh <version>` is
the real check. Versions **4.9.0 and earlier report no `version` field at all**. This is
what hid the stalled rollout above for a full day.

---

## Spec-driven behaviour changes worth remembering

| Spec | Change | Why it's easy to get wrong |
|---|---|---|
| 006 (2026-07-18) | Planning became **inventory-neutral** — deduction moved to the cooked confirmation | Every pre-006 code path assumed adding a meal deducted stock. Absent `entry.status` means a *legacy* entry and reads as `cooked`, which is why the field deliberately has no schema default |
| 007 | Grocery check-off became **inventory-positive** — ticking a row adds/merges stock and stores a `purchaseReceipt` | Reversal must come from the stored receipt, never a recomputation |
| 008 (2026-07-22) | Grocery list became a **rolling, date-scoped view recomputed on every GET** | Generated rows are reconciled *in place* by `ingredientName` so `_id` stays stable. A wipe-and-recreate reintroduces the duplicate-row bug: a preserved same-day purchased row whose name isn't recorded gets re-inserted as brand new |
| 009 | Quick-add opt-in duplicate merging; ingredient-scoped recommendations | `mergeDuplicates` is opt-in precisely so only the Kitchen quick-add path merges |
| 011 | Administration split from end-user surfaces | An unprivileged caller gets **403, never 401** — 401 is the client's refresh-retry trigger and would loop |
| 002 US4 | RP-initiated sign-out | Clearing the local session alone lets the IdP silently restore the same user on next sign-in |

---

## Testing failures that produced the rules in CLAUDE.md §8

- **A refusal matrix that silently tested nothing.** `it.each` expands at *collection* time
  while the table was built in `beforeAll` → **zero** cases registered, and the file reported
  2 passing tests instead of 14. Build matrices at module scope.
- **`db.ts` reads `MONGODB_URI` at module scope.** Importing routes before setting it froze
  the default `localhost:27017` — passed locally against a real Mongo, failed in CI.
- **`.env.local` leaked into the e2e build** (it's read by `next start`, not just
  `next dev`), promoting every request to admin. The refusal assertions were **passing for
  the wrong reason**. The env fallback now applies only to header-less requests.
- **The rate limiter is module-level state across tests.** The 11th erase in a file got a
  429 and the test asserted against an action that never happened. Reset the key per test.
- **mongod's cold start** is paid by whichever `tests/server/**` suite sorts first, which
  exceeded Vitest's 10s default hook timeout at random. Fixed globally with
  `hookTimeout: 60_000`.
- **Mongoose buffers when unconnected** — a settings read on the AI hot path hung four
  DB-free suites for 5s each. Short-circuit on `readyState`.
- **Date time bombs.** `inventory-edit.e2e.ts` hardcoded an expiry that the calendar
  eventually rolled past. Compute dates relative to run time.
- **Readiness reported `mongodb: down` on a cold process** because nothing had called
  `connectDb()` yet. A readiness probe must answer "can we serve?", not "have we already".

---

## Miscellaneous

- **`scripts/smoke-test.sh` is a shared file** and drifted 24 lines between `main` and
  `impl/nextjs` when a spec-006 cascade was never promoted up — then copying `main`'s stale
  copy down regressed the gate mid-work. Shared files are edited **only on `main`** and must
  stay byte-identical across branches.
- **`origin/main` has disjoint history** from the impl branches and contains **no
  `packages/`**. An implementation worktree based on it will look catastrophically empty.
- **`.claude/agents/` is gitignored** (`.claude/*` is ignored except `.claude/commands/`).
  Subagent definitions are local-only — edit in place; there is nothing to commit or PR.
