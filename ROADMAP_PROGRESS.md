# Roadmap Progress — fridge-planner

> Working log for the post-migration reconciliation + polish roadmap.
> Update the **two lines at the top** at the end of every session. That's the whole system.

**▶ NEXT ACTION:** **Phase B — verify "complete" claims (applies to BOTH impls).** Pick ONE feature area (suggest inventory first) and walk the shared checklist [`checklists/acceptance-scenarios.md`](specs/001-meal-planner/checklists/acceptance-scenarios.md) against the running app **on each branch** — `impl/nextjs` (client :3000 + Express :3001) and `impl/vite` (client :5173 + Express :3001). Record pass/fail + bugs per branch in that branch's `specs/001-meal-planner/verification-findings.md` (reference scenario IDs). Route per the table below: **spec-gap** (no scenario/FR) → `spec.md` on `main`; **frontend bug** → the one branch; **backend bug** → both branches (Express is duplicated). Triage only — don't fix mid-discovery. **Progress:** `impl/nextjs` **Phase B COMPLETE — all 4 areas** (inventory/recs/calendar/grocery, 2026-06-08/11): **8 bugs + 3 spec-gaps** (see its `verification-findings.md`). **Next:** **confirm the findings on `impl/vite`** (per user) — the backend bugs (#1,#4,#5,#6,#7,#8) share Express code so they're expected there; check the SPA-specific UI (highlighting, drag-drop) and #2/#3. Then route fixes (Phase C) + spec-owner decisions on SG-01/02/03.
**⏸ LAST LEFT OFF:** 2026-06-08 — Completed branching-strategy steps 1–3 in Claude Code. Steps 1–2 (prior): topology verified, shared contract + genericized constitution v3.1.0 on `main`, branches renamed to `impl/vite`+`impl/nextjs` (local+origin), CLAUDE.md §8 reconciled on `impl/nextjs`. Step 3 (this turn): genericized the constitution backend too (Express vs Route Handlers now per-branch); merged `main` into BOTH impl branches (constitution→main's, spec.md tightening propagated to `impl/vite`, README/.gitignore kept per-branch); added "Stack Realization" sections to each `plan.md`. Also reconciled `origin/main`'s disjoint-history skeleton (LICENSE+README) via `--allow-unrelated-histories`. **Then (same day):** reframed Phase B/C/D as applying to BOTH impls (shared `checklists/acceptance-scenarios.md` + per-branch `verification-findings.md` + status matrix), and made the sync **conflict-free by construction (Tier 1/2)** — branch-agnostic README + unified `.gitignore` identical on all branches, per-branch setup → `docs/DEVELOPMENT.md`, `scripts/sync-impls.sh` + `BRANCHING_STRATEGY.md` §10, plus a read-only sync-lag check in `weekly-drift-check`. Both impls verified 0 commits behind `main`. **Then started Phase B:** walked the **inventory area on `impl/nextjs`** against the running app — US1-S1/S7/S8/S9, EC-04/EC-11, SC-013 PASS; found **BUG #1 (HIGH)** cross-user data leak (`GET /inventory` ignores `userId` → backend, both branches) and **BUG #2** EC-03 no duplicate-merge prompt; raised spec-gap SG-01 (make per-user isolation an explicit FR). Logged in `impl/nextjs` `verification-findings.md`.

---

## The roadmap at a glance

- **Phase A — Reconcile migration with the spec** (spec-tweak cascade) ✅ DONE
- **Branching strategy — two-impl model (Vite + Next.js)** ✅ DONE (2026-06-08; §5 steps 1–3: shared contract on `main`, branches renamed, both impls synced)
- **Phase B — Verify "complete" claims, triage rough edges** (bug vs spec-gap) — **both impls** ◀ NEXT
- **Phase C — Polish pass** (work the Phase B list, 1 issue/session) — **both impls**
- **Phase C-bis — Retire Express into Next Route Handlers** (optional architectural change; sequenced against `002`) — not started, **`impl/nextjs`-only**
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
| B — Verify | ☐ not started | ☑ **all 4 areas done** (inventory/recs/calendar/grocery, 2026-06-08/11); **8 bugs, 3 spec-gaps** | scenario checklist + spec-gap register |
| C — Polish | ☐ not started | ☐ not started | (works the B findings) |
| D — `002` auth | ☐ not started | ☐ not started | `002` spec (topology-agnostic) on `main` |

*(Status legend: ☐ not started · ◐ in progress · ☑ done. Update per cell as each branch progresses.)*

### Spec-gap register (shared — fix on `main`, both inherit)

Findings with **no** covering scenario/FR. File the spec change on `main`, add the new scenario ID to the shared checklist, then check the box.

| ID | Found on | Description | Spec change | Status |
|----|----------|-------------|-------------|--------|
| SG-01 | impl/nextjs (inventory) | No FR/CR explicitly requires per-user data isolation — only implied by "my/their inventory" + CR-001. Surfaced by a live cross-user data-leak bug (`GET /inventory` ignores `userId`). | Propose an explicit FR (or tighten CR-001) on `main`; then both impls' isolation bugs trace to a testable requirement. | **DECIDED 2026-06-11: explicit FR + fix #1 now (both branches).** Add **FR-036** (all data ops scoped to authenticated user). Spec already asserts it in Key Entities→User + CR-001. |
| SG-02 | impl/nextjs (recommendations) | SC-002 "within 5 s" doesn't distinguish a **cached** hit from a **cold, web-researched** recommendation (measured **142 s** live — the agent does `WebSearch`/`WebFetch`). The 5 s target is unrealistic for the chosen architecture. Companion to `impl/nextjs` BUG #3. | Decide: re-architect for 5 s (drop web search / async job / stream) **or** revise SC-002 (e.g. split cached `<5 s` vs fresh `<N s`). Then edit SC-002 on `main`. | **DECIDED 2026-06-11: async UX + soften SC-002.** Recommendations become async (immediate loading state, delivered when ready); reword SC-002 as a UX/time-to-first-feedback criterion + mark the endpoint async (exempt from CR-008 <200ms). Async UX itself is per-branch Phase C. |
| SG-03 | impl/nextjs (grocery) | US3-S2/S3 + SC-005 assume meals carry ingredient **quantities/units** (e.g. "milk 1 cup", "6 eggs"), but `MealRecommendation.missingIngredients` is `string[]` (names only). So quantity-aware aggregation/normalization/deduction is impossible by design (BUG #8); grocery items are a meal-count in `'servings'`. | Decide: (a) extend the meal model — agent returns `{name, quantity, unit}` per ingredient — to meet US3-S2/S3/SC-005, or (b) revise those scenarios to the servings/count model. | **DECIDED 2026-06-11: revise spec to servings model.** Defer **FR-027** (inventory deduction) + **FR-028** (unit normalization) to Phase 2+; clarify FR-026 (aggregate by meal-count/servings); revise US3-S2/S3 + soften SC-005. Spec-only; BUG #8 then "matches spec". |

> **Phase B bugs are logged per-branch** in each branch's `verification-findings.md` (not here). The register above is only for *spec-gaps* (shared, fixed on `main`). Open bugs on `impl/nextjs` (all backend → expected on **both** branches; confirm on `impl/vite`): **#1** cross-user data leak (HIGH; GET/PUT/DELETE + recommendations ignore `userId`), **#2** EC-03 no duplicate-merge prompt, **#3** SC-002 latency 142s vs 5s (HIGH; spec-tension w/ SG-02), **#4** EC-08/SC-010 no agent-failure fallback (→500), **#5** EC-01 no popular-recipe fallback on empty inventory, **#6** `expirationStatus` stale (only recomputed on save → breaks SC-014 expired-exclusion + stale UI highlighting; MED–HIGH), **#7** consumption one-way/non-idempotent (DELETE doesn't restore inventory; move/remove/duplicate over-decrements; MED), **#8** grocery is count-of-meals not quantity-aware (US3-S2/S3 + SC-005 unimplemented; MED; w/ SG-03).

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

- [ ] Cb0 — Scaffold server layer: `src/server/db.ts` with `globalThis`-cached Mongoose connection (avoids dev hot-reload "model already compiled"); move models in; add `import 'server-only'` guards. No behavior change.
- [ ] Cb1 — Migrate **inventory** (pure CRUD, lowest risk): `app/api/inventory/route.ts` + `[id]/route.ts`. Re-point only this path off the Express proxy in `next.config.ts`. Run existing tests against handlers.
- [ ] Cb2 — Migrate **grocery-lists**, including nested `checkout` action as its own `route.ts`.
- [ ] Cb3 — Migrate **meal-plans** read/write only (NOT recommendations yet).
- [ ] Cb4 — Migrate **recommendations LAST**: `src/server/holodeck.ts` calling the sidecar on :8001. Spend the testing budget here — timeouts, agent-down, malformed responses. Only endpoint with an external dependency.
- [ ] Cb5 — Retire Express: delete proxy rules from `next.config.ts`; remove `packages/server` from dev script + docker-compose; drop `CORS_ORIGIN` (same-origin now). One Node process.
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
| 2026-06-08 | strategy step 3 (sync) | genericized constitution backend (Express vs Route Handlers→per-branch); merged `main`→both impl branches (spec tightening propagated to `impl/vite`); added "Stack Realization" to both plan.md; reconciled disjoint `origin/main` (LICENSE/README) via `--allow-unrelated-histories` | Phase B verify on `impl/nextjs` |
| 2026-06-08 | strategy steps 1–2 | verified §6 topology; landed shared spec+checklists+genericized constitution (3.1.0)+strategy+roadmap on `main`; renamed branches→`impl/vite`+`impl/nextjs` (local+origin); reconciled CLAUDE.md §8 on `impl/nextjs` | step 3 sync discipline |
| 2026-06-07 | branching strategy (design) | designed two-impl model; wrote specs/BRANCHING_STRATEGY.md handoff; linked in CLAUDE.md | Claude Code executes |
| 2026-06-07 | A5 | committed Phase A docs + analyze'd spec on branch, tagged `migration-docs-reconciled` (not merged) | Phase B (verify claims) |
| 2026-06-07 | analyze | `/speckit.analyze` run; spec.md tightened (FR-013 removed, FR-034/35 deferred, FR-003/028 clarified) | A5 commit |
| 2026-06-07 | A4 | swept 5173/nginx/vite (clean); added CORS_ORIGIN to .env.example | A5 (commit, no merge) |
| 2026-06-07 | A3 + skill fix | README.md → Next.js (verified vs disk); moved skill to `.claude/skills/weekly-drift-check/` | A4 (.env.example sweep + analyze) |
| 2026-06-07 | A2 | plan.md → Next.js; source tree verified vs disk | A3 (README.md) |
| 2026-05-31 | A1 | constitution.md → Next.js + v3.0.0 | Commit on branch; then A2 (plan.md) |
