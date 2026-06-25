# Roadmap Progress — fridge-planner

> Working log for the post-migration reconciliation + polish roadmap.
> Update the **two lines at the top** at the end of every session. That's the whole system.

**▶ NEXT ACTION:** **Phase C-bis IN PROGRESS (`impl/nextjs`-only) — Cb0–Cb5 ✅ (Express RETIRED from runtime; 2026-06-25).** **Cb5 soft-retire (3 commits):** **5a** `e95ee95` ported middleware to `src/server` — in-memory `rate-limit.ts` (recommendations 10/min → 429, restoring the Cb4 gap) + `withRoute()` error wrapper (unhandled throw → Problem JSON 500) on all 12 routes; **5c** `9d8c09b` stopped running Express — dropped it from `dev`/`build` scripts + docker-compose, client now talks to Mongo+Holodeck directly (no PORT/CORS/BACKEND_URL); **5b** `a2308d4` ported 88 pure-logic unit tests (unit-normalizer/matcher/categorizer/expiration/generator) Jest→Vitest. **`next build` compiles all 12 route handlers** (first real-bundler validation). `npm test` green: server **199/199** + client **252/252**, lint clean. **Soft-retire = `packages/server` stays in-tree (unrun) as the integration net; the final `rm` is gated on a real boot.** **Next — real-boot smoke test** (`next dev` against live Mongo + a couple of endpoint hits) → then **Cb6** (doc cascade: CLAUDE.md/plan.md/README → "Next.js Route Handlers"; version → 4.0.0; remove unused `concurrently` devDep; delete `packages/server` once the boot passes).

**(Prior — Cb0–Cb4, ALL endpoints migrated to Next; Express proxy gone; 2026-06-24):** Express→Next Route Handler migration. **Cb0** Next server-layer scaffold (`db.ts` globalThis-cached Mongoose, deps, `@server/*` alias; `e57e82a`). **Cb1** inventory (thin handlers over extracted controller + `http.ts`; node-env + `mongodb-memory-server` harness; `fad36c7`). **Cb2** grocery-lists (6 routes incl. `complete`→inventory FR-032; grocery libs + grocery-list/meal-plan models; 16 tests; `71c5214`). **Cb3** meal-plans (reversible consume/restore preserved BUG #7/FR-005; added `src/server/logger.ts` to decouple `ingredient-consumption` from Express; 11 tests drive REAL consume/restore; `e395890`). **Cb4** recommendations LAST (`controllers/recommendations.ts` preserves the full fallback ladder — EC-01 empty→popular, cache hit, EC-08 agent-down→stale-cache-else-popular, never 500; copied meal-recommender + popular-recipes; **next.config proxy + proxyTimeout removed entirely**; 5 tests w/ mocked agent; `f627c48`). **Transition rule:** shared models/libs were **copied** into `src/server`; the duplication **collapses to a single source of truth when Express is deleted at Cb5**. Coverage gate restored earlier (78.41→81.29%; `d475dc4`→`4f8132e`). Suites green: server **199/199**, client **159/159**, lint clean. **Next — Cb5 (RETIRE EXPRESS):** remove `packages/server` from the dev script + docker-compose, drop `CORS_ORIGIN`, **reimplement the deferred middleware** (esp. the recommendations **10-req/min rate limiter** — express-rate-limit, not yet ported; endpoint currently unthrottled, mitigated by the 15-min cache) + decide a shared error wrapper (unhandled throw → Problem JSON), then delete `packages/server`. ⚠ **Two decisions to confirm before teardown:** (1) rate-limiter approach in Next; (2) delete `packages/server` outright vs. keep its Jest suite. Then **Cb6** doc cascade + version bump (→ 4.0.0).

> **Future roadmap (Phase 2+, deferred):** move inventory consumption from **planning time** to **grocery-checkout / "mark cooked"** time (per #7 decision 2026-06-20) — planning a meal would no longer mutate inventory; the inventory↔usage loop would run through checkout. Bigger UX + spec change; revisit post-MVP.
**⏸ LAST LEFT OFF:** 2026-06-25 — **Phase C-bis Cb5 soft-retire** (Express retired from runtime: middleware ported `e95ee95`, stopped running `9d8c09b`, 88 unit tests ported `a2308d4`). `next build` validates all 12 handlers; `npm test` green (server 199 + client 252); lint clean. `packages/server` kept in-tree (unrun) as the net. **Next: real-boot smoke test, then Cb6** (doc cascade + version 4.0.0 + delete `packages/server`). User chose in-memory limiter + soft-retire. This ROADMAP edit landed on `main` and synced to both impls. *(Earlier this stretch: Cb0–Cb4 all endpoints migrated; prior session 2026-06-22: Phase C COMPLETE — see session log.)*

---

## The roadmap at a glance

- **Phase A — Reconcile migration with the spec** (spec-tweak cascade) ✅ DONE
- **Branching strategy — two-impl model (Vite + Next.js)** ✅ DONE (2026-06-08; §5 steps 1–3: shared contract on `main`, branches renamed, both impls synced)
- **Phase B — Verify "complete" claims, triage rough edges** (bug vs spec-gap) — **both impls** ◀ NEXT
- **Phase C — Polish pass** (work the Phase B list, 1 issue/session) — **both impls** ✅ **DONE (2026-06-22)** — all 7 bugs + SG-01/02/03
- **Phase C-bis — Retire Express into Next Route Handlers** (optional architectural change; sequenced against `002`) — ◐ **IN PROGRESS (2026-06-25): Cb0–Cb5 ✅ (Express retired from runtime); real-boot smoke test → Cb6 (docs + 4.0.0 + delete packages/server) next**, **`impl/nextjs`-only**
- **Phase D — Spec `002` (authentication / real auth)** — not started — **both impls** (shared spec, per-branch enforcement)

> **Phases B/C/D are spec-level → they apply to BOTH `impl/vite` and `impl/nextjs`** (per `BRANCHING_STRATEGY.md` §5). C-bis is the lone exception (plan-level, `impl/nextjs`-only). See the "Phase B/C/D — both-implementation tracking" section below for the model + status matrix.

---

## Two-implementation branching strategy — execution state

See `specs/BRANCHING_STRATEGY.md` for the full model. Recommended sequence (§5) progress:

- [x] Step 1 — Shared spec content on `main` (spec.md + checklists/requirements.md verbatim; constitution.md genericized to v3.1.0; BRANCHING_STRATEGY.md + ROADMAP_PROGRESS.md as shared coordination layer).
- [x] Step 2 — Rename branches: `001-meal-planner`→`impl/vite`, `001-meal-planner-nextj-migrate`→`impl/nextjs` (local + origin; old remote branches deleted). `001-meal-planner-agent-refinement` left untouched (already merged via PR #4).
- [x] Step 3 — `main → impl/*` sync done (2026-06-08): merged `main` into both impl branches. Resolutions: constitution.md→main's genericized v3.1.0; spec.md→main's (propagated the A5 tightening to `impl/vite`); README.md + .gitignore kept per-branch; LICENSE+BRANCHING_STRATEGY+ROADMAP added. "Stack Realization" sections added to both `plan.md`s. **Sync convention going forward (Tier 1/2, 2026-06-08):** sync is now **conflict-free by construction** — run `bash scripts/sync-impls.sh` (or `git merge --no-edit main` per impl branch). Shared files (`spec.md`, `constitution.md`, `checklists/*`, `ROADMAP_PROGRESS.md`, `README.md`, `.gitignore`, `LICENSE`, `BRANCHING_STRATEGY.md`) are byte-identical on every branch and only edited on `main`; per-branch files (`plan.md`, `docs/DEVELOPMENT.md`, `CLAUDE.md`, `verification-findings.md`, code) never exist on `main`. No more `--ours`/`--theirs` judgement. See `BRANCHING_STRATEGY.md` §10.
- [ ] Step 4 — `impl/nextjs` proceeds to Phase B (verify) BEFORE C-bis changes the API topology. ◀ NEXT
- [ ] Step 5 — Phase B/C/D against the shared spec; route fixes per strategy §5 (spec-gap→`main`, bug→the branch where it occurs).

**Decisions carried (do not re-litigate, from §9):** shared = spec + criteria + checklist + constitution principles on `main`; per-branch = `plan.md` + code + concrete stack; C-bis is `impl/nextjs`-only; `002` auth spec stays topology-agnostic; merge to `main` of impl code deferred until all migration phases complete.

---

## Phase B/C/D — both-implementation tracking

Phases B (verify), C (polish), D (`002` auth) are **spec-level**, so each runs against **both** `impl/vite` and `impl/nextjs`. The model (decided 2026-06-08):

- **Shared layer (on `main`):** one canonical scenario list — [`checklists/acceptance-scenarios.md`](specs/001-meal-planner/checklists/acceptance-scenarios.md) with stable IDs (`US1-S4`, `EC-08`, `SC-014`, …) — plus the **spec-gap register** below. Both impls inherit on `git merge main`.
- **Per-branch layer (on each `impl/*`):** `specs/001-meal-planner/verification-findings.md` — that branch's pass/fail + bug log, referencing scenario IDs. Per-branch file (kept with `--ours` on sync).

**Finding-routing rule:**

| Finding | Fix where | Why |
|---|---|---|
| No scenario/FR covers it (**spec-gap**) | `spec.md` on `main` (+ add scenario to the shared checklist) | Contract gap — both impls owe it; inherited on sync |
| **Frontend** bug | the one branch where it occurs | Vite SPA vs Next SSR genuinely differ |
| **Backend / shared-logic** bug | **both** branches | `packages/server` (Express) is duplicated today → fix on one, cherry-pick to the other (until C-bis retires Express on `impl/nextjs`) |

**Tip:** walk the same feature area on both branches back-to-back — a failure on both is usually a spec-gap or a shared backend bug; a failure on one is usually frontend-specific.

### Phase status matrix

| Phase | `impl/vite` | `impl/nextjs` | Shared artifact |
|---|---|---|---|
| B — Verify | ☑ **confirmed** (2026-06-11, code-identity) | ☑ **all 4 areas done** (inventory/recs/calendar/grocery, 2026-06-08/11); **8 bugs, 3 spec-gaps** | scenario checklist + spec-gap register |
| C — Polish | ☑ **ALL #1–#7 ✔ + #3/SG-02** | ☑ **ALL #1–#7 ✔ + #3/SG-02** (latest `9a2c33e`); server **185/185**, client **118/118** | **Phase C COMPLETE** — #8→spec; SG-01/02/03 applied |
| D — `002` auth | ☐ not started | ☐ not started | `002` spec (topology-agnostic) on `main` |

*(Status legend: ☐ not started · ◐ in progress · ☑ done. Update per cell as each branch progresses.)*

### Spec-gap register (shared — fix on `main`, both inherit)

Findings with **no** covering scenario/FR. File the spec change on `main`, add the new scenario ID to the shared checklist, then check the box.

| ID | Found on | Description | Spec change | Status |
|----|----------|-------------|-------------|--------|
| SG-01 | impl/nextjs (inventory) | No FR/CR explicitly requires per-user data isolation — only implied by "my/their inventory" + CR-001. Surfaced by a live cross-user data-leak bug (`GET /inventory` ignores `userId`). | Propose an explicit FR (or tighten CR-001) on `main`; then both impls' isolation bugs trace to a testable requirement. | **DECIDED 2026-06-11: explicit FR + fix #1 now (both branches).** Add **FR-036** (all data ops scoped to authenticated user). Spec already asserts it in Key Entities→User + CR-001. |
| SG-02 | impl/nextjs (recommendations) | SC-002 "within 5 s" doesn't distinguish a **cached** hit from a **cold, web-researched** recommendation (measured **142 s** live — the agent does `WebSearch`/`WebFetch`). The 5 s target is unrealistic for the chosen architecture. Companion to `impl/nextjs` BUG #3. | Decide: re-architect for 5 s (drop web search / async job / stream) **or** revise SC-002 (e.g. split cached `<5 s` vs fresh `<N s`). Then edit SC-002 on `main`. | **DECIDED 2026-06-11: async UX + soften SC-002.** Recommendations become async (immediate loading state, delivered when ready); reword SC-002 as a UX/time-to-first-feedback criterion + mark the endpoint async (exempt from CR-008 <200ms). Async UX itself is per-branch Phase C. |
| SG-03 | impl/nextjs (grocery) | US3-S2/S3 + SC-005 assume meals carry ingredient **quantities/units** (e.g. "milk 1 cup", "6 eggs"), but `MealRecommendation.missingIngredients` is `string[]` (names only). So quantity-aware aggregation/normalization/deduction is impossible by design (BUG #8); grocery items are a meal-count in `'servings'`. | Decide: (a) extend the meal model — agent returns `{name, quantity, unit}` per ingredient — to meet US3-S2/S3/SC-005, or (b) revise those scenarios to the servings/count model. | **DECIDED 2026-06-11: revise spec to servings model.** Defer **FR-027** (inventory deduction) + **FR-028** (unit normalization) to Phase 2+; clarify FR-026 (aggregate by meal-count/servings); revise US3-S2/S3 + soften SC-005. Spec-only; BUG #8 then "matches spec". |

> **Phase B bugs are logged per-branch** in each branch's `verification-findings.md` (not here). The register above is only for *spec-gaps* (shared, fixed on `main`). Open bugs (found on `impl/nextjs`, **CONFIRMED on `impl/vite` 2026-06-11 via byte-identical server code**; #4 is *worse* on `impl/vite` — its `meal-recommender` lacks the 220s timeout): **~~#1~~ ✔ FIXED 2026-06-11** (FR-036; `userId` scoping on inventory GET/PUT/DELETE + recs; TDD'd; `impl/vite` `29d2e89` → cherry-picked `impl/nextjs` `532e198`), **~~#2~~ ✔ FIXED 2026-06-21** (EC-03 duplicate-merge prompt; Merge/Add-separately/Cancel; `7ba9c59`→`abf3088`), **~~#3~~ ✔ RESOLVED 2026-06-22** (SC-002/FR-012 async via SG-02; client surfaces fallback + immediate non-blocking loading; `b193323`→`9a2c33e`; true 202+poll deferred Phase 2+), **~~#4~~ ✔ FIXED 2026-06-19** (EC-08/SC-010 graceful fallback — stale-cache→popular, no more 500; `impl/vite` got the 220s timeout; `edfb0a9`→`3cc068d`), **~~#5~~ ✔ FIXED 2026-06-19** (EC-01 empty→popular recipes), **~~#6~~ ✔ FIXED 2026-06-19** (`expirationStatus` now date-derived on read — `expiration.ts` query builders + GET recompute; SC-014/US1-S9 pass; `impl/vite` `95afbe5` → `impl/nextjs` `41e9881`), **~~#7~~ ✔ FIXED 2026-06-20** (reversible consumption — POST consumes / DELETE restores / PUT net-diffs, awaited; FR-005 clarified; `c6bf4b8`→`7dca07a`), **#8** grocery is count-of-meals not quantity-aware — **now matches spec (SG-03 servings) → reclassified Phase-2+, not a bug**. **Remaining: #2** (EC-03 duplicate prompt, per-branch frontend) and the **async recommendation UX** (#3/SG-02, per-branch frontend).

> **SG-01/02/03 spec edits APPLIED to `spec.md` + `acceptance-scenarios.md` (2026-06-11):** added **FR-036** (data isolation); deferred **FR-027/FR-028** to Phase 2+; **FR-026** + **US3-S2/S3** + **SC-005** → servings model; **FR-012** + **SC-002** → async (exempt from CR-008). **Effect on bugs:** **#8 now matches spec** (servings is the contract → reclassify as Phase-2+ enhancement, not a bug). **Remaining code follow-ups (Phase C, per branch):** fix **#1** against the new FR-036 (both branches); build the **async recommendation UX** for SC-002 (per-branch client).

---

## Phase A — task checklist

- [x] A1 — `constitution.md`: stack, tooling, performance, version → 3.0.0
- [x] A2 — `specs/001-meal-planner/plan.md`: Technical Context, ports, architecture
- [x] A3 — `README.md`: ports (5173→3000), architecture diagram, client container, structure tree
- [x] A4 — `.env.example` + spec sweep for `5173`/Nginx refs; run `/speckit.analyze`
- [x] A5 — Commit Phase A doc edits on `impl/nextjs` (was `001-meal-planner-nextj-migrate`) + tag checkpoint `migration-docs-reconciled`. **Not merged** — merge deferred until all migration phases complete.

## Phase C-bis — Retire Express into Next Route Handlers

> Optional architectural change, **`impl/nextjs`-only** (plan-level, never touches the shared spec). Collapses the Express API (:3001) into Next.js Route Handlers so the app runs as one Node process. Plausibly a **major version bump (3.x → 4.0.0)** of the per-branch plan. Each step is ~1 session and ends runnable; Express keeps running until the last step removes it.
>
> **✅ Merge boundary DECIDED (2026-06-07):** option (b) — impl-code merge to `main` is deferred until ALL migration phases are complete. A5 commits + tags on the branch but does not merge. C-bis lands as a further self-consistent checkpoint on the SAME `impl/nextjs` branch.

- [x] Cb0 — Scaffold server layer: `src/server/db.ts` with `globalThis`-cached Mongoose connection (avoids dev hot-reload "model already compiled"); add `import 'server-only'` guards. No behavior change. **✅ 2026-06-23 `e57e82a`** — also added `mongoose`/`zod`/`server-only` deps + `@server/*` alias. (Models are copied in progressively per endpoint, not all up-front — Express still needs its copies until Cb5.)
- [x] Cb1 — Migrate **inventory** (pure CRUD, lowest risk): `app/api/v1/inventory/route.ts` + `[id]/route.ts`. Re-point only this path off the Express proxy in `next.config.ts`. Tests against the handlers. **✅ 2026-06-23 `fad36c7`** — thin handlers over extracted `src/server/controllers/inventory.ts` + `http.ts`; proxy uses an explicit allow-list (not a catch-all) so it can't shadow the `/inventory/[id]` dynamic route; node-env Vitest + `mongodb-memory-server` harness (`@server`/`server-only` aliased) covers CRUD + FR-036 isolation + BUG #6 derived status. Client 118→127.
- [x] Cb2 — Migrate **grocery-lists**, including nested `checkout`/`complete` action as its own `route.ts`. **✅ 2026-06-24 `71c5214`** — all six routes under `app/api/v1/grocery-lists/[weekStart]/` over `controllers/grocery-lists.ts`; copied grocery libs (generator/matcher/categorizer/unit-normalizer) + grocery-list & meal-plan models into `src/server`; 16 node-env handler tests (client 127→143). Note: `complete` ADDS bought goods to inventory (FR-032), so it does **not** touch `ingredient-consumption` — the logger wrinkle moved to Cb3.
- [x] Cb3 — Migrate **meal-plans** read/write only (NOT recommendations yet). **✅ 2026-06-24 `e395890`** — GET / `entries` POST / `entries/[slotId]` DELETE / PUT over `controllers/meal-plans.ts`; reversible consume/restore preserved (BUG #7/FR-005); added `src/server/logger.ts` (framework-neutral, pino-shaped) to **decouple `ingredient-consumption` from Express's `app.ts`**; 11 node-env tests drive real consume/restore vs seeded inventory (client 143→154).
- [x] Cb4 — Migrate **recommendations LAST** (only endpoint with an external dep — Holodeck :8001). **✅ 2026-06-24 `f627c48`** — `app/api/v1/recommendations/route.ts` (maxDuration=240) over `controllers/recommendations.ts`, preserving the full fallback ladder (EC-01 empty→popular · cache hit · EC-08 agent-down/timeout/malformed → stale-cache-else-popular, never 500); copied `services/meal-recommender.ts` (220s timeout) + `lib/popular-recipes.ts`; recommendations-cache already in `src/server` since Cb1; 5 node-env tests w/ mocked agent. **next.config proxy rewrites + proxyTimeout removed entirely.** ⚠ **Rate limiter NOT ported** (deferred to Cb5).
- [x] Cb5 — Retire Express (**soft-retire**, decisions: in-memory limiter + keep `packages/server` until real-boot). **✅ 2026-06-25** — **5a** `e95ee95` middleware ported (`src/server/rate-limit.ts` 10/min→429 + `withRoute` error wrapper on all 12 routes); **5c** `9d8c09b` stopped running Express (dev/build scripts + docker-compose + CORS/PORT/BACKEND_URL); **5b** `a2308d4` ported 88 pure-logic unit tests (Jest→Vitest). `next build` validates all handlers; `npm test` server 199 + client 252. **Deferred to follow-up:** `rm packages/server` (gated on real-boot smoke test) + porting the DB/fetch unit tests (already covered by handler tests).
- [ ] Cb6 — Doc cascade + version bump (SAME checkpoint as the code, not after): plan.md Backend section → "Next.js Route Handlers"; bump plan/version; update plan.md deps + tree; update README ports/diagram.

**Sequencing vs Phase D (`002` auth):** same-origin Route Handlers + Next middleware make auth simpler than a split-origin Express API. If retiring Express at all, doing C-bis *before* D means building auth once on the consolidated architecture. C-bis is OPTIONAL — "Express stays, auth built on it" is defensible. This is why C-bis sits before D but is not a hard prerequisite: decide deliberately.

## Carried-forward notes (don't lose these)

- **Constitution §1** still lists "Day, Week, Month, Year views" but only `/`, `/calendar`, `/grocery` routes exist. Pre-existing gap — triage in Phase B. (Shared concern; lives on `main` now.)
- **Test-dir drift (found in A2):** `packages/client/tests/` still has `pages/GroceryListPage.test.tsx` after source moved `pages/`→`views/`; test subfolders lag `src/components`. Triage in Phase B (on `impl/nextjs`).
- **plan.md Testing line** keeps "Vitest + RTL" — left as-is (still the test runner); optional: note `vitest.config.ts` decoupling.
- **holodeck image name (found in A3):** docker-compose.yml `holodeck` service uses image `ghcr.io/emtabiraobarias/fridge-planner:latest` — odd that the agent shares the app's image repo name. Glance during Phase B.
- **README cascade table** step 6 still points at `.specify/memory/constitution.md` (stale — **root `constitution.md` is canonical**). Separate doc cleanup, not migration scope.
- **`.env.local` undocumented (found in A4):** docker-compose.yml references `.env.local` as an optional `env_file` for the holodeck service, but it's not in `.env.example` or documented in the README. Document or remove — triage in Phase B.
- **CLAUDE.md §11 cascade** still points at `.specify/memory/constitution.md` for the spec-tweak cascade; root `constitution.md` is canonical. Pre-existing drift (per-branch CLAUDE.md, so fix on each `impl/*`).
- **ROADMAP duplication (resolved 2026-06-08):** both impl branches now carry a copy synced from `main`. **This `main` copy is canonical** — update it here; impl copies will lag until their next `git merge main` (acceptable for a working log). Don't hand-edit the impl copies.

## Session log (newest first)

| Date | Phase/Task | What changed | Next |
|------|-----------|--------------|------|
| 2026-06-25 | C-bis Cb5 | **retired Express from runtime** (soft-retire): ported middleware to `src/server` (in-memory rate limiter 10/min→429 + `withRoute` Problem-JSON error wrapper on all 12 routes; `e95ee95`), stopped running Express (dev/build scripts + docker-compose + CORS/PORT/BACKEND_URL; `9d8c09b`), ported 88 pure-logic unit tests Jest→Vitest (`a2308d4`). `next build` validates handlers; `npm test` server 199 + client 252. `packages/server` kept as net. | real-boot smoke test → Cb6 |
| 2026-06-24 | C-bis Cb4 | migrated **recommendations** (last endpoint) → Next Route Handler over `controllers/recommendations.ts`; preserved EC-01/cache/EC-08 fallback ladder; copied meal-recommender + popular-recipes; **removed the next.config proxy entirely**; 5 node-env tests (mocked agent). Client 154→159, server untouched. ⚠ rate limiter deferred to Cb5. `f627c48` | Cb5 (retire Express) |
| 2026-06-24 | C-bis Cb3 | migrated **meal-plans** → Next Route Handlers (GET, `entries` POST, `entries/[slotId]` DELETE, PUT) over `controllers/meal-plans.ts`; preserved reversible consume/restore (BUG #7/FR-005); added framework-neutral `src/server/logger.ts` to decouple `ingredient-consumption` from Express's `app.ts`; 11 node-env tests drive real consume/restore. Client 143→154, server untouched. `e395890` | Cb4 (recommendations, last — Holodeck dep) |
| 2026-06-24 | C-bis Cb2 | migrated **grocery-lists** → Next Route Handlers (6 routes under `[weekStart]/`: GET lazy-gen, `generate`, `items` POST, `items/[itemId]` PATCH/DELETE, `complete`→inventory) over `controllers/grocery-lists.ts`; copied grocery libs + grocery-list/meal-plan models into `src/server`; 16 node-env handler tests. Client 127→143, server untouched. `71c5214` | Cb3 (meal-plans + logger decouple) |
| 2026-06-23 | C-bis Cb1 | migrated **inventory** → Next Route Handlers (`app/api/v1/inventory/{route,[id]/route}.ts`) over extracted controller + `http.ts`; copied model/expiration/cache/types into `src/server`; proxy → explicit allow-list; node-env handler tests vs `mongodb-memory-server` (`@server`+`server-only` aliased). Client 118→127, lint clean, server untouched. `fad36c7` | Cb2 (grocery-lists + checkout) |
| 2026-06-23 | C-bis Cb0 | scaffolded `src/server/db.ts` (globalThis-cached Mongoose, `server-only`); added `mongoose`/`zod`/`server-only` deps + `@server/*` alias. No behavior change. `e57e82a` | Cb1 (inventory) |
| 2026-06-23 | coverage gate | restored server 80% branch gate (latently red 78.41% from Phase C #6/#7) → 81.29%: unit tests for `expirationStatusQuery`/`notExpiredQuery` + a `restoreIngredients` suite (incl. catch-block error paths). Test-only. Lead `impl/vite` `d475dc4` → cherry-pick `impl/nextjs` `4f8132e`. Server 185→199 | (unblocks C-bis npm test) |
| 2026-06-08 | strategy step 3 (sync) | genericized constitution backend (Express vs Route Handlers→per-branch); merged `main`→both impl branches (spec tightening propagated to `impl/vite`); added "Stack Realization" to both plan.md; reconciled disjoint `origin/main` (LICENSE/README) via `--allow-unrelated-histories` | Phase B verify on `impl/nextjs` |
| 2026-06-08 | strategy steps 1–2 | verified §6 topology; landed shared spec+checklists+genericized constitution (3.1.0)+strategy+roadmap on `main`; renamed branches→`impl/vite`+`impl/nextjs` (local+origin); reconciled CLAUDE.md §8 on `impl/nextjs` | step 3 sync discipline |
| 2026-06-07 | branching strategy (design) | designed two-impl model; wrote specs/BRANCHING_STRATEGY.md handoff; linked in CLAUDE.md | Claude Code executes |
| 2026-06-07 | A5 | committed Phase A docs + analyze'd spec on branch, tagged `migration-docs-reconciled` (not merged) | Phase B (verify claims) |
| 2026-06-07 | analyze | `/speckit.analyze` run; spec.md tightened (FR-013 removed, FR-034/35 deferred, FR-003/028 clarified) | A5 commit |
| 2026-06-07 | A4 | swept 5173/nginx/vite (clean); added CORS_ORIGIN to .env.example | A5 (commit, no merge) |
| 2026-06-07 | A3 + skill fix | README.md → Next.js (verified vs disk); moved skill to `.claude/skills/weekly-drift-check/` | A4 (.env.example sweep + analyze) |
| 2026-06-07 | A2 | plan.md → Next.js; source tree verified vs disk | A3 (README.md) |
| 2026-05-31 | A1 | constitution.md → Next.js + v3.0.0 | Commit on branch; then A2 (plan.md) |
