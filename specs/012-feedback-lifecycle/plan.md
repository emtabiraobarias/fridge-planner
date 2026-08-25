# Implementation Plan: Feedback Lifecycle — triage to closure

**Branch**: `012-implement` (off `impl/nextjs`) | **Date**: 2026-08-24 | **Spec**: [spec.md](spec.md)
**Input**: `specs/012-feedback-lifecycle/spec.md` — 61 `FR-FL-*` requirements, 10 `SC-FL-*`

> **Per-branch file.** `plan.md` never exists on `main` (BRANCHING_STRATEGY.md §10). The shared
> contract is `spec.md`; this document is *how `impl/nextjs` builds it*.

## Summary

Define and build the lifecycle a feedback record enters once it exists: an eleven-stage model with
three human gates, EARS clause drafting and vetting at `briefed`, brief assembly a human runs,
five triage capabilities, reporter-visible status plus a maintainer reply, and explicit closure
composing an excerpt and a release link.

The technical shape follows from three facts about the existing system, not from new architecture:
the pipeline collection already models most of this (R1), the feedback agent already carries the
untrusted-text framing clause drafting needs (R3), and the admin surface already exists to host
the maintainer half (R6). **The largest single risk is not new code — it is that erasure currently
deletes the very items D15 says must survive (R4).**

## Technical Context

**Language/Version**: TypeScript 5.x, strict (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`), Node 20
**Primary Dependencies**: Next.js 15 (App Router, Route Handlers), React 18, Mongoose 8, Zod, jose, Tailwind — **no new dependency** (R9)
**Storage**: MongoDB. Evolve the existing `pipeline_items` collection (R1); no new collection
**Testing**: Vitest (node-env server tests + jsdom client), Playwright e2e — **mandatory for the primary journey**
**Target Platform**: Single Next process on :3000, same-origin API
**Project Type**: Web (single full-stack app — `packages/client` is the whole stack)
**Performance Goals**: Non-agent endpoints p95 <200ms (`001` CR-008). Clause drafting is agent-backed and exempt, like every other assistant call
**Constraints**: Closure must never block on GitHub (`FR-FL-045`). Reporter isolation is server-side (R5). No transition may commit/merge/tag/deploy (`FR-FL-057`)
**Scale/Scope**: Single-node internal deployment; tens of reporters, hundreds of items. 11 stages, 3 gates, 2 surfaces

**Unknowns**: **one, open by decision** — D18 modal placement (R8). Blocks only the quick-capture
tasks; every other task proceeds without it. **Must not be resolved by default at implementation time.**

## Constitution Check

*GATE: must pass before Phase 0. Re-checked after Phase 1 — see the bottom of this file.*

**Twelve-Factor**

- [x] **Codebase** — single repo, `012-implement` off `impl/nextjs`
- [x] **Dependencies** — no new package (R9)
- [x] **Config** — one new env var, `GITHUB_REPO`; no credential (R7)
- [x] **Backing Services** — GitHub reached by config URL, treated as attached and detachable (R7)
- [x] **Build/Release/Run** — unchanged; agent change ships as an `agent-feedback-v*` release before the app depends on it (R3)
- [x] **Processes** — stateless; the release cache is a process-local optimisation with a TTL, never state of record
- [x] **Port Binding** — unchanged
- [x] **Concurrency** — transitions are atomic guarded `findOneAndUpdate`, so two processes cannot both apply one (`FR-FL-004`)
- [x] **Disposability** — no new startup work
- [x] **Dev/Prod Parity** — same Mongo + agents in both
- [x] **Logs** — existing structured logger
- [x] **Admin Processes** — the stage migration (R1) is a one-off task, not app startup

**Security**

- [x] OIDC on every endpoint; maintainer actions behind `requirePrincipalAdmin` (403 not 401)
- [x] Role from a verified token claim, never a header in prod
- [x] Report text stays data, never instruction (`FR-FL-058`)
- [x] Reporter isolation enforced by projection, not by the client (R5)
- [x] Rate limiting on the agent-backed clause-drafting call
- ⚠️ **New outbound egress to api.github.com.** Read-only, unauthenticated, no user data sent — only a repo path. Recorded because it is the app's first outbound call to a third party.

**Testing**

- [x] TDD — failing test first, naming the `FR-FL-*` it covers
- [x] Coverage ≥80% backend / ≥70% frontend
- [x] Playwright covers the primary journey **as part of the story tasks, not a follow-up**
- [x] Contract tests per endpoint

**Result: PASS.** One item flagged (egress), none violated. No entry in Complexity Tracking.

## Project Structure

### Documentation (this feature)

```
specs/012-feedback-lifecycle/
├── spec.md              # shared, on main
├── checklists/
│   └── requirements.md  # shared, on main
├── plan.md              # this file (per-branch)
├── research.md          # Phase 0 (per-branch)
├── data-model.md        # Phase 1 (per-branch)
├── contracts/api.md     # Phase 1 (per-branch)
└── quickstart.md        # Phase 1 (per-branch)
```

### Source (repository root)

```
packages/client/
├── app/api/v1/
│   ├── lifecycle/                    # NEW — reporter-visible reads
│   │   ├── route.ts                  #   GET own items (stage only)
│   │   └── [id]/route.ts             #   GET one (own; merged → target stage only)
│   ├── admin/lifecycle/              # NEW — the maintainer half (requirePrincipalAdmin)
│   │   ├── route.ts                  #   GET queue, cross-user, ?stage=&priority=
│   │   └── [id]/
│   │       ├── route.ts              #   GET full · PATCH transition/triage action
│   │       ├── clauses/route.ts      #   GET drafted · PATCH vet one · POST redraft
│   │       ├── brief/route.ts        #   GET assembled brief
│   │       └── reply/route.ts        #   PUT maintainer reply
│   ├── admin/releases/route.ts       # NEW — cached GitHub release list (D17)
│   └── pipeline/**                   # KEPT, deprecated — see Migration
├── src/server/
│   ├── models/lifecycle-item.ts      # RENAMED from pipeline-item.ts (same collection)
│   ├── controllers/lifecycle.ts      # NEW — transitions, triage, closure
│   ├── controllers/admin-lifecycle.ts# NEW — queue + cross-user reads
│   ├── services/release-list.ts      # NEW — cached, degrade-never-block (R7)
│   ├── services/feedback-collector.ts# EXTENDED — clause-drafting mode (R3)
│   ├── lib/lifecycle-stages.ts       # NEW — stage graph + legality, single source of truth
│   ├── lib/feedback-export.ts        # EXTENDED — brief carries vetted clauses
│   ├── lib/account-purge.ts          # CHANGED — detach, do not delete (R4) ⚠️
│   └── lib/health-checks.ts          # EXTENDED — release-list probe
├── src/
│   ├── views/AdminPage.tsx           # EXTENDED — delivery tab (R6)
│   ├── components/admin/             # NEW — TriageQueue, ClauseVetting, ClosureComposer
│   ├── components/feedback/          # CHANGED — reporter status becomes read-only
│   └── services/lifecycle.ts         # NEW — browser fetchers
└── e2e/lifecycle.e2e.ts              # NEW — the primary journey
agents/feedback-collector/            # EXTENDED — clause-drafting prompt + eval
```

**Structure decision**: Option 2 (web), matching the existing single-process full-stack layout.
No new top-level directory; every path above sits in an established tree.

## Phases

Ordered so each is independently shippable and testable, and so the riskiest correction lands
first rather than last.

### Phase A — Stage model + migration *(foundational; blocks everything)*
`lib/lifecycle-stages.ts` as the single source of truth for stages, legal transitions, gates and
terminals. Rename the model, widen the enum, add fields, migrate `approved → accepted` (R1).
Server tests assert the whole legality matrix, including that every terminal refuses every
transition and that `closed` refuses all (`FR-FL-049`).

### Phase B — Erasure detachment ⚠️ *(do early, not late)*
Split `USER_KEYED_MODELS` into delete-list and detach-list; implement detachment; update CLAUDE.md
§5's "adding a seventh" rule for two lists (R4). **Sequenced second deliberately**: it corrects
shipped behaviour that currently destroys data D15 says must survive, and every later phase adds
more such data.

### Phase C — Triage (US1) + reporter visibility (US2)
Gate 1, dismissal with reason, merge with status-only projection (R5), edit-before-brief,
priority ordering; the maintainer queue and the reporter's own view. First end-to-end slice: a
report can be accepted or dismissed and the reporter sees the outcome.

### Phase D — Clause drafting + vetting (US3)
Agent second mode (R3), clause storage, per-clause vetting, the `briefed → in-spec` block while
any clause is unvetted (`FR-FL-028`), brief assembly. Ships behind the existing agent's release.

### Phase E — Gates + delivery (US4)
Gates 2 and 3, park/reopen, gate-2 rejection returning to `briefed`. Completes the maintainer
surface.

### Phase F — Closure (US5) + releases (D17)
Release list service and probe (R7), closure composition with pre-filled excerpt, fallback path,
citation of closed items.

### Phase G — Erasure story (US7), polish, gate
US7 e2e, `lifecycle.e2e.ts` primary journey, full gate: lint, tests at threshold, build,
`validate-e2e.sh`, Playwright.

### Requirement → phase traceability

All 61. `/speckit.tasks` derives task coverage from this, and `/speckit.analyze` checks it — an
unmapped requirement is how a story ships half-done.

| Phase | Requirements |
|---|---|
| **A** stage model | FR-FL-001, 002, 003, 004, 005, 007, 011, 049, 057 |
| **B** erasure detach | FR-FL-059, 060, 061 |
| **C** triage + reporter visibility | FR-FL-006, 008, 016, 017, 018, 019, 020, 021, 022, 023, 034, 035, 036, 037, 038, 039, 052, 053, 054, 055, 056 |
| **D** clauses + brief | FR-FL-024, 025, 026, 027, 028, 029, 030, 031, 032, 033 |
| **E** gates + delivery | FR-FL-009, 010, 012, 013, 014, 015 |
| **F** closure + releases | FR-FL-040, 041, 042, 043, 044, 045, 046, 047, 048, 050, 051 |
| **G** polish + gate | FR-FL-058 *(asserted as an invariant across every agent-backed path)* |

Success criteria: SC-FL-001→C · SC-FL-002→C · SC-FL-003→C *(projection, R5)* · SC-FL-004→A ·
SC-FL-005→D · SC-FL-006→E · SC-FL-007→A · SC-FL-008→F · SC-FL-009→C · SC-FL-010→B.

## Migration

`app/api/v1/pipeline/**` is **kept and deprecated**, not deleted. It is the surface `003` shipped
and the one the current UI calls; removing it in the same change that rewrites the model would
make a large diff impossible to bisect. It proxies to the new controller for reads and refuses
writes once Phase E lands, and is removed in a follow-up once no client calls it.

The `approved → accepted` migration runs as a one-off admin task (Twelve-Factor XII), not on
startup — startup migrations are invisible when they fail.

## Complexity Tracking

No constitutional violation requires justification. The one flagged item (outbound GitHub egress)
is required by D17, is read-only and unauthenticated, and is explicitly specified to degrade
rather than block.

## Open decision carried into implementation

**D18 modal placement (R8) is unresolved by the operator's choice.** It blocks only the
quick-capture tasks (`003` T020 / `FR-F-019a`/`b`). Every phase above is independent of it.
**It must be answered, not defaulted** — if implementation reaches those tasks first, stop and ask.

## Post-Design Constitution Re-check

Re-evaluated after `data-model.md` and `contracts/api.md`:

- **Still PASS.** No new dependency, no new service, no new persistent store.
- The detach-list (R4) *adds* rigour to erasure rather than weakening it: the outcome becomes
  defined instead of incidental.
- Reporter isolation is enforced at the projection, so `SC-FL-003` is testable at the API
  boundary rather than through the UI.
- The one flagged item (egress) is unchanged and remains justified by D17.
