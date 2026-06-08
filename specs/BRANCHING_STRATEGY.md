# Branching Strategy — Two Implementations, One Spec

> **START HERE (for Claude Code):** This document defines a two-implementation branching
> model (Vite + Next.js) that shares a single spec. Before acting on ANY branch operation:
> 1. Read this whole file.
> 2. Read `ROADMAP_PROGRESS.md` (repo root) for current phase state.
> 3. Run the **Verification commands** in §6 — the topology assumptions below are UNCONFIRMED
>    and must be checked before you rename, cherry-pick, or merge anything.
> 4. Note the **conflicts with `CLAUDE.md`** in §8 — two existing rules contradict this strategy
>    and need reconciling, not blind obedience.
>
> This plan was designed in a planning session that had filesystem read/write but **no git or
> shell access**, so every git step here is unexecuted and unverified. Treat all topology
> claims as hypotheses to confirm, not facts.

---

## 1. The goal

Keep **two long-lived implementation branches** of the meal-planner app:

- **Vite implementation** — the original React + Vite SPA.
- **Next.js implementation** — the React + Next.js 15 App Router migration.

Both implement **one shared specification**. Reason: a real deployment hedge — either may ship.
Expected lifetime: experimental; one or both may be retired later. Because retirement is on the
table, the strategy favours low-ceremony Git conventions over heavyweight extraction (no
submodule/separate spec repo yet).

## 2. The model — shared *what*, branch-specific *how*

The spec is the **contract**; each branch's `plan.md` is a **conformance claim** against it.

| Artifact | Shared or per-branch | Lives on | Notes |
|---|---|---|---|
| `specs/<feature>/spec.md` | **Shared** | `main` | The *what*/*why*. Already stack-agnostic (mentions no bundler). |
| Success criteria (`SC-XXX`), `checklists/requirements.md` | **Shared** | `main` | Outcomes both impls owe. |
| `constitution.md` — **principles** (security, testing, perf targets, API-first, 12-factor) | **Shared** | `main` | The CR-001…CR-019 obligations apply to both impls. |
| `constitution.md` — **Technology Stack subsection (§2)** | **Per-branch concern** | see §3 | The one stack-specific part. |
| `specs/<feature>/plan.md` | **Per-branch** | each impl branch | The *how*: stack, wiring, ports, architecture. |
| Application code | **Per-branch** | each impl branch | |

**Golden rule:** spec changes NEVER originate on an implementation branch. They are authored on
`main` (or a short-lived spec branch merged to `main`), and each impl branch merges `main` in to
receive them. Impl branches only ever edit their own `plan.md` + code.

## 3. Constitution split (decided)

Do **not** fork the whole constitution. Keep one shared `constitution.md` of principles on `main`,
and push the concrete stack name **down into each branch's `plan.md`** ("Stack Realization"
section). In a two-impl world the concrete "Next.js" or "Vite" belongs in the plan, not the shared
constitution — this partially *reverts* the Phase A constitution edit that hard-coded Next.js into
the stack section. Rewrite the constitution's Technology Stack subsection generically (e.g. "a
modern build/SSR toolchain; concrete stack is specified per-branch in plan.md").

## 4. Branch topology (decided, pending name confirmation in §6)

Existing local branches (confirmed via refs this session):
`main`, `001-meal-planner`, `001-meal-planner-agent-refinement`, `001-meal-planner-nextj-migrate`
(HEAD is on `001-meal-planner-nextj-migrate`).

**Do NOT create a new branch for Vite.** Reuse the two branches that already hold the two
implementations; rename for clarity so neither looks like a throwaway feature branch:

| Current name | New name | Role |
|---|---|---|
| `001-meal-planner` (assumed = the Vite impl) | `impl/vite` | Long-lived Vite implementation |
| `001-meal-planner-nextj-migrate` | `impl/nextjs` | Long-lived Next.js implementation |
| `main` | `main` (unchanged) | Shared spec + integration point |
| `001-meal-planner-agent-refinement` | (decide) | Unclear role — investigate before touching |

> **ASSUMPTION TO CONFIRM:** that `001-meal-planner` is the Vite implementation and the parent the
> Next.js branch was cut from. Confirm with §6 before renaming.

## 5. How the phases re-map

- **Phase B (verify), C (polish), D (auth `002`)** are **spec-level** phases → they apply to the
  shared contract, therefore to BOTH branches.
  - A finding that's a **spec gap** (no FR covers it) → fix on `main`; both branches inherit on
    next sync.
  - A finding that's a **bug** (violates an existing FR) → fix on the branch where it occurs; the
    bug may exist in one impl and not the other.
  - Run the scenario walk once per running branch, but maintain ONE checklist (scenarios are shared).
- **Phase C-bis (retire Express into Next.js Route Handlers)** is **plan-level** and **Next.js-only**.
  It lives entirely in `impl/nextjs`'s `plan.md` + code and never touches the shared spec — because
  "Express vs Route Handlers" is a *how*, not a *what*. This is the proof the model works.
- **Auth (`002`) topology-agnostic rule:** `002`'s spec must describe auth *outcomes* (CR-001 style),
  never the middleware mechanism. Each branch's `plan.md` says how it enforces auth (Express
  middleware on Vite branch; possibly Route Handler middleware on Next.js branch post-C-bis). If
  `002` can't stay topology-agnostic, that's a signal the branches have diverged too far to share a
  spec — reconsider keeping both.

### Recommended sequence
1. Get the **shared spec content onto `main`** first (see §7 — Phase A reconciliation currently
   lives on the Next.js branch, not `main`).
2. Rename branches (§4).
3. Establish the `main` → impl sync discipline (§2 golden rule).
4. `impl/nextjs` proceeds to **C-bis**. Verify (Phase B) BEFORE C-bis changes the API topology, so
   you're not verifying a moving target.
5. Phase B/C/D run against the shared spec, fixes routed per §5.

## 6. Verification commands (RUN FIRST — topology is unconfirmed)

```bash
cd /Users/emeraldbarias/Git/fridge-planner
git log --oneline --graph --all --decorate | head -40
git merge-base main 001-meal-planner
git merge-base 001-meal-planner 001-meal-planner-nextj-migrate
# Confirm which branch holds Vite vs Next.js:
git show 001-meal-planner:packages/client/package.json | grep -E '"(vite|next)"'
git show 001-meal-planner-nextj-migrate:packages/client/package.json | grep -E '"(vite|next)"'
# Is the Vite work already on main, or is main behind?
git log --oneline main..001-meal-planner | head
```

Interpretation:
- If `main` is **behind** `001-meal-planner` (Vite never merged to `main`): `main` lacks the baseline
  app; step one is landing the shared spec on `main` (merge spec-only paths, or author fresh — see §7).
- If `main` **already has** the Vite impl: simpler — renaming + sync discipline is most of the job.

## 7. The Phase A commit-split problem (needs care)

Phase A reconciled the spec cascade to Next.js, and the A5 checkpoint commit bundled BOTH:
- **stack-agnostic** edits (the `/speckit.analyze` spec.md tightening) — these belong on `main`/shared.
- **Next.js-specific** edits (`plan.md`, constitution stack section, README ports, `.env` CORS) —
  these belong ONLY on `impl/nextjs`.

Because they're in one commit (`migration-docs-reconciled` tag on the Next.js branch), getting the
shared parts onto `main` cleanly requires either:
- **(a) cherry-pick / path-restricted approach:** land only `spec.md` (and other shared paths) on
  `main`. Delicate with a bundled commit.
- **(b) author-fresh approach (lower risk):** leave Phase A as-is on `impl/nextjs`; re-create the
  shared `spec.md` content on `main` directly. More typing, zero cherry-pick risk. **Recommended
  while experimenting.**

## 8. Conflicts with `CLAUDE.md` (reconcile, don't blindly follow)

`CLAUDE.md` was rewritten as a Next.js-only document and has two rules that fight this strategy:
- **§14 "Don't revert to Vite or recreate `vite.config.ts`"** — correct for `impl/nextjs`, but the
  whole point of `impl/vite` is to keep the Vite implementation alive. This rule must be scoped to
  the Next.js branch, not the repo. Consider a per-branch note or moving stack-specific "NOT to do"
  items into each branch's `plan.md`.
- **§10 "Branch from `main`"** with `feat/`/`fix/` prefixes — fine for shared spec work, but impl
  work now lives on the long-lived `impl/*` branches. Clarify that feature *specs* branch from `main`
  while *implementation* happens on `impl/*`.

Also: `CLAUDE.md` §11 and the spec-tweak cascade still point at `.specify/memory/constitution.md`,
but the **root `constitution.md` is canonical** (the `.specify/memory` copy is ignored scaffolding).
Pre-existing drift, logged in `ROADMAP_PROGRESS.md`.

## 9. Decisions vs. pending

**Decided (do not re-litigate):**
- Shared = `spec.md` + success criteria + checklist + constitution principles, on `main`.
- Per-branch = `plan.md` + code + concrete stack name.
- Reuse existing branches; rename to `impl/vite` + `impl/nextjs`; do not create a new Vite branch.
- Constitution: shared principles + per-branch stack in `plan.md` (genericize stack §2).
- Merge to `main` is deferred until all migration phases complete (per `ROADMAP_PROGRESS.md`).
- C-bis is Next.js-only, plan-level.
- `002` auth spec stays topology-agnostic.

**Pending (must verify/decide before acting):**
- [ ] Confirm `001-meal-planner` = Vite impl, and the true fork points (§6).
- [ ] Confirm whether `main` already contains the Vite implementation or is behind.
- [ ] Choose Phase A split approach: (a) cherry-pick vs (b) author-fresh on `main` (§7). Recommend (b).
- [ ] Decide the role of `001-meal-planner-agent-refinement` (rename, fold in, or leave).
- [ ] Reconcile the two `CLAUDE.md` conflicts (§8).
- [ ] Decide the merge condition wording so an undecided/declined C-bis doesn't block `main` forever.
