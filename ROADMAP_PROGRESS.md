# Roadmap Progress — fridge-planner

> Working log for the post-migration reconciliation + polish roadmap.
> Update the **two lines at the top** at the end of every session. That's the whole system.

**▶ NEXT ACTION:** Phase B Session 1 — verify the "complete" claims against the running app. Start the app (`npm run dev`, client :3000 + server :3001), pick ONE feature area (suggest inventory first), and walk its acceptance scenarios from spec.md. Log each failure as bug (has FR) vs spec-gap (no FR). Triage only — don't fix mid-discovery.
**⏸ LAST LEFT OFF:** 2026-06-07 — A5 complete: Phase A doc edits + analyze'd spec committed on `001-meal-planner-nextj-migrate` and tagged `migration-docs-reconciled` (NOT merged — deferred per merge condition). Phase A (migration reconciliation) fully done.

> **⚠ A5 commit is run by the user** (no git tool available here). If the commit/tag hasn't been run yet, that's the actual next physical step before Phase B — see the command block handed over in chat on 2026-06-07.

---

## The roadmap at a glance

- **Phase A — Reconcile migration with the spec** (spec-tweak cascade) ◀ IN PROGRESS
- **Phase B — Verify "complete" claims, triage rough edges** (bug vs spec-gap)
- **Phase C — Polish pass** (work the Phase B list, 1 issue/session)
- **Phase C-bis — Retire Express into Next Route Handlers** (optional architectural change; sequenced against `002`) — not started
- **Phase D — Spec `002` (authentication / real auth)** — not started

---

## Phase A — task checklist

- [x] A1 — `constitution.md`: stack, tooling, performance, version → 3.0.0
- [x] A2 — `specs/001-meal-planner/plan.md`: Technical Context, ports, architecture
- [x] A3 — `README.md`: ports (5173→3000), architecture diagram, client container, structure tree
- [x] A4 — `.env.example` + spec sweep for `5173`/Nginx refs; run `/speckit.analyze`
- [x] A5 — Commit Phase A doc edits on `001-meal-planner-nextj-migrate` + tag checkpoint `migration-docs-reconciled`. **Not merged** — merge deferred until all migration phases complete. *(commit run by user)*

## Phase C-bis — Retire Express into Next Route Handlers

> Optional architectural change. Collapses the Express API (:3001) into Next.js Route Handlers so the app runs as one Node process. Plausibly a **major version bump (3.0.0 → 4.0.0)**. Each step is ~1 session and ends runnable; Express keeps running until the last step removes it.
>
> **✅ Merge boundary DECIDED (2026-06-07):** option (b) — the merge to `main` is deferred until ALL migration phases are complete. A5 commits + tags on the branch but does not merge. C-bis lands as a further self-consistent checkpoint on the SAME `001-meal-planner-nextj-migrate` branch. Nothing reaches `main` until the merge condition below is met.

- [ ] Cb0 — Scaffold server layer: `src/server/db.ts` with `globalThis`-cached Mongoose connection (avoids dev hot-reload "model already compiled"); move models in; add `import 'server-only'` guards. No behavior change.
- [ ] Cb1 — Migrate **inventory** (pure CRUD, lowest risk): `app/api/inventory/route.ts` + `[id]/route.ts`. Re-point only this path off the Express proxy in `next.config.ts`. Run existing tests against handlers.
- [ ] Cb2 — Migrate **grocery-lists**, including nested `checkout` action as its own `route.ts`.
- [ ] Cb3 — Migrate **meal-plans** read/write only (NOT recommendations yet).
- [ ] Cb4 — Migrate **recommendations LAST**: `src/server/holodeck.ts` calling the sidecar on :8001. Spend the testing budget here — timeouts, agent-down, malformed responses. Only endpoint with an external dependency.
- [ ] Cb5 — Retire Express: delete proxy rules from `next.config.ts`; remove `packages/server` from dev script + docker-compose; drop `CORS_ORIGIN` (same-origin now). One Node process.
- [ ] Cb6 — Doc cascade + version bump (SAME checkpoint as the code, not after): constitution Backend section → "Next.js Route Handlers"; bump to 4.0.0; update plan.md deps + tree; update README ports/diagram.

**Sequencing vs Phase D (`002` auth):** same-origin Route Handlers + Next middleware make auth simpler than a split-origin Express API. If retiring Express at all, doing C-bis *before* D means building auth once on the consolidated architecture. C-bis is OPTIONAL — "Express stays, auth built on it" is defensible. This is why C-bis sits before D but is not a hard prerequisite: decide deliberately.

**Merge condition for the branch (DECIDED 2026-06-07):** all migration phases complete — A5 committed, Phase B verification done, and (if undertaken) Phase C-bis complete with its doc cascade. Only then does `001-meal-planner-nextj-migrate` merge to `main`. A branch with a merge *condition* is a deferred merge; without one it's drift waiting to compound.

## Carried-forward notes (don't lose these)

- **Constitution §1** still lists "Day, Week, Month, Year views" but only `/`, `/calendar`, `/grocery` routes exist. Pre-existing gap — triage in Phase B, not Phase A.
- **Test-dir drift (NEW, found in A2):** `packages/client/tests/` still has `pages/GroceryListPage.test.tsx` after source moved `pages/`→`views/`; test subfolders lag `src/components`. Triage in Phase B.
- **plan.md Testing line** keeps "Vitest + RTL" — left as-is (still the test runner); optional: note `vitest.config.ts` decoupling for consistency with constitution.
- **holodeck image name (found in A3):** docker-compose.yml `holodeck` service uses image `ghcr.io/emtabiraobarias/fridge-planner:latest` — odd that the agent shares the app's image repo name. Glance during Phase B.
- **README cascade table** step 6 still points at `.specify/memory/constitution.md` (stale location — root is canonical). Separate doc cleanup, not migration scope.
- **`.env.local` undocumented (found in A4):** docker-compose.yml references `.env.local` as an optional `env_file` for the holodeck service, but it's not in `.env.example` or documented in the README. Document or remove — triage in Phase B.
- **`/speckit.analyze` RUN 2026-06-07 (provenance for spec move):** formal analyze pass executed in Claude Code before the A5 checkpoint; it edited `spec.md` — removed FR-013 (consolidated into FR-012), marked FR-034/FR-035 deferred with rationale, removed US1 scenario 5, clarified FR-003 (auto-categorization is grocery-aggregation-only) and FR-028 (SI units default, metric/imperial toggle deferred). Spec is internally consistent post-pass. These edits are part of the A5 commit.
- Constitution edits logically belong **on the migration branch** so the doc cascade ships with the code.

## Session log (newest first)

| Date | Phase/Task | What changed | Next |
|------|-----------|--------------|------|
| 2026-06-07 | A5 | committed Phase A docs + analyze'd spec on branch, tagged `migration-docs-reconciled` (not merged) | Phase B (verify claims) |
| 2026-06-07 | analyze | `/speckit.analyze` run; spec.md tightened (FR-013 removed, FR-034/35 deferred, FR-003/028 clarified) | A5 commit |
| 2026-06-07 | A4 | swept 5173/nginx/vite (clean); added CORS_ORIGIN to .env.example | A5 (commit, no merge) |
| 2026-06-07 | A3 + skill fix | README.md → Next.js (verified vs disk); moved skill to `.claude/skills/weekly-drift-check/` | A4 (.env.example sweep + analyze) |
| 2026-06-07 | A2 | plan.md → Next.js; source tree verified vs disk | A3 (README.md) |
| 2026-05-31 | A1 | constitution.md → Next.js + v3.0.0 | Commit on branch; then A2 (plan.md) |
