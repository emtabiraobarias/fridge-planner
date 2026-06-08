# Roadmap Progress — fridge-planner

> Working log for the post-migration reconciliation + polish roadmap.
> Update the **two lines at the top** at the end of every session. That's the whole system.

**▶ NEXT ACTION:** **Phase B — verify "complete" claims on `impl/nextjs`.** Start the app (`npm run dev`; client :3000 + Express :3001), pick ONE feature area (suggest inventory first), and walk its acceptance scenarios from `spec.md`. Log each failure as **bug** (violates an existing FR → fix on the branch where it occurs) vs **spec-gap** (no FR covers it → fix on `main`, both impls inherit on next sync). Triage only — don't fix mid-discovery. The two-impl branching strategy (§5 steps 1–3) is fully landed; both impl branches now carry the shared contract.
**⏸ LAST LEFT OFF:** 2026-06-08 — Completed branching-strategy steps 1–3 in Claude Code. Steps 1–2 (prior): topology verified, shared contract + genericized constitution v3.1.0 on `main`, branches renamed to `impl/vite`+`impl/nextjs` (local+origin), CLAUDE.md §8 reconciled on `impl/nextjs`. Step 3 (this turn): genericized the constitution backend too (Express vs Route Handlers now per-branch); merged `main` into BOTH impl branches (constitution→main's, spec.md tightening propagated to `impl/vite`, README/.gitignore kept per-branch); added "Stack Realization" sections to each `plan.md`. Also reconciled `origin/main`'s disjoint-history skeleton (LICENSE+README) via `--allow-unrelated-histories`.

---

## The roadmap at a glance

- **Phase A — Reconcile migration with the spec** (spec-tweak cascade) ✅ DONE
- **Branching strategy — two-impl model (Vite + Next.js)** ✅ DONE (2026-06-08; §5 steps 1–3: shared contract on `main`, branches renamed, both impls synced)
- **Phase B — Verify "complete" claims, triage rough edges** (bug vs spec-gap) ◀ NEXT
- **Phase C — Polish pass** (work the Phase B list, 1 issue/session)
- **Phase C-bis — Retire Express into Next Route Handlers** (optional architectural change; sequenced against `002`) — not started, `impl/nextjs`-only
- **Phase D — Spec `002` (authentication / real auth)** — not started

---

## Two-implementation branching strategy — execution state

See `specs/BRANCHING_STRATEGY.md` for the full model. Recommended sequence (§5) progress:

- [x] Step 1 — Shared spec content on `main` (spec.md + checklists/requirements.md verbatim; constitution.md genericized to v3.1.0; BRANCHING_STRATEGY.md + ROADMAP_PROGRESS.md as shared coordination layer).
- [x] Step 2 — Rename branches: `001-meal-planner`→`impl/vite`, `001-meal-planner-nextj-migrate`→`impl/nextjs` (local + origin; old remote branches deleted). `001-meal-planner-agent-refinement` left untouched (already merged via PR #4).
- [x] Step 3 — `main → impl/*` sync done (2026-06-08): merged `main` into both impl branches. Resolutions: constitution.md→main's genericized v3.1.0; spec.md→main's (propagated the A5 tightening to `impl/vite`); README.md + .gitignore kept per-branch; LICENSE+BRANCHING_STRATEGY+ROADMAP added. "Stack Realization" sections added to both `plan.md`s. **Sync convention going forward:** `main` is canonical for shared files; impl branches `git merge main` and resolve per-branch files (README, .gitignore) with `--ours`, shared files (spec, constitution) with `--theirs`.
- [ ] Step 4 — `impl/nextjs` proceeds to Phase B (verify) BEFORE C-bis changes the API topology. ◀ NEXT
- [ ] Step 5 — Phase B/C/D against the shared spec; route fixes per strategy §5 (spec-gap→`main`, bug→the branch where it occurs).

**Decisions carried (do not re-litigate, from §9):** shared = spec + criteria + checklist + constitution principles on `main`; per-branch = `plan.md` + code + concrete stack; C-bis is `impl/nextjs`-only; `002` auth spec stays topology-agnostic; merge to `main` of impl code deferred until all migration phases complete.

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
