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

## The feedback lifecycle (spec 012) — why it exists and what was decided

The shipped feedback feature collected reports and then did almost nothing coherent with them:
*"the overall flow from feedback to admin approval to spec-driven development to completion loop
is not defined at all."* That was a **missing lifecycle**, not four broken screens — `003` had
already proved a report could be captured well. So `003` was scoped back to capture, `012` took
everything that happens to a record afterwards, and `011` kept owning *who may act*.

**The twenty design decisions (2026-08-23)** are recorded in full in
`specs/012-feedback-lifecycle/spec.md` → Clarifications. The ones that shaped the code most:

- **D1 genuinely multi-user.** Reporters the operator does not know, so privacy between them is a
  requirement rather than a nicety. It replaced `003`'s single-maintainer assumption.
- **D3 the app never runs the work.** It assembles a brief; a human starts every run. No job
  runner, no scheduler, no agent holding repository credentials.
- **D5 three gates**, D9 **explicit closure** — nothing auto-closes on merge or release.
- **D13 `closed` never reopens.** A wrongly-fixed problem is a NEW report that *cites* the closed
  one, so each record describes exactly one round of work.
- **D15 work outlives an erased account.** See the erasure entry below — this one contradicted
  shipped code.
- **D17 closure names a release**, which introduced the app's first outbound third-party call.
- **D18 quick capture asks before it interrupts** — resolved to *ask in the modal, before
  sending*. The alternative (send first, ask only if the assistant came back with a question)
  optimises a case that barely occurs: the agent's prompt mandates a clarifying question whenever
  detail is missing, and `003` records that it "almost always" asks one, so it would have asked
  nearly every time anyway — after a wait bounded by the 60s agent timeout.

### Decisions that overturned earlier fixed ones

Recorded because silent reversals are how documents drift apart:

- `003` SC-F-007 promised *"zero hand-maintained tracking."* D4 keeps stage advancement
  hand-driven, so that criterion was **retired, not inherited** — `012` SC-FL-004 restates the
  achievable half. Carrying an unmet success criterion forward would have been worse than
  admitting it.
- `003` Assumption 9 excluded a maintainer-facing spec editor; D8 brings one in and D20 goes
  further, drafting EARS clauses at `briefed` and vetting them clause by clause.
- D4 ruled out GitHub integration; **D17 narrowly reopened it** — read-only, one endpoint, for the
  release picker alone, and it never drives a stage.

### Erasure: the shipped code did the opposite of what D15 requires

`lib/account-purge.ts` listed the lifecycle collection in `USER_KEYED_MODELS` and `deleteMany`'d
it, so erasing a reporter **destroyed every item their report had started**, including maintainer
work in flight that other people were waiting on. D15 settles it the other way, and the purge now
has **two tables with different semantics**: delete, and detach. A detached item is not an orphan
for `011` FR-AD-018 — detachment is the *defined* outcome. Anonymising by hashing the userId was
rejected: a hash is still a per-user key, so it re-identifies the same person across collections.

This was sequenced FIRST in the implementation, before any user story, because every story after
it adds more data that would have been eaten.

### The release picker publishes tags, not Releases

D17 says closure picks "a release from the repository's published releases". Run against the real
repository, the picker returned `available: true` and **zero entries**: this project has 0 GitHub
Release objects and 15 tags, because `deploy-nextjs.yml` tags `nextjs-v*` and never calls
`gh release create`. Falling back to tags is faithful rather than a workaround — per CLAUDE.md
§14 the **tag IS the release here**, and it is what CI builds. Entries carry
`source: 'release' | 'tag'` so the UI can say which it is offering.

The whole service is shaped by one rule: **closure is never gated on a third party**
(FR-FL-045). It never throws, never retries, reports unavailability as a normal answer, and the
readiness probe reports it as **non-gating** — letting an unreachable GitHub mark the app
not-ready would hand a third party the power to take the deployment down.

### Two models, one collection

`012` evolved the existing collection rather than adding one: the stage sets nest almost
perfectly, and only `approved → accepted` actually changed. The trap found during
implementation: the collection is **`pipelineitems`**, Mongoose's default pluralisation — the
design documents all said `pipeline_items`, and a model test asserted that literal and *passed
while being wrong*, because it was checking its own setting rather than the shipped model. The
test now asserts `LifecycleItem.collection.name === PipelineItem.collection.name`, a property a
wrong guess cannot satisfy. **Only `LifecycleItem` may write `stage`** — the old enum predates the
new values and rejects them, which is why the deprecated `promote` endpoint returns its idempotent
response instead of trying to accept.

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
