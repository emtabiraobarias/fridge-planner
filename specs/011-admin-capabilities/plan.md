# Implementation Plan: Administration Capabilities (`impl/nextjs`)

**Branch**: `011-implement` · **Date**: 2026-08-01 · **Spec**: [`spec.md`](spec.md) · **Research**: [`research.md`](research.md)
**Input**: Shared spec `specs/011-admin-capabilities/spec.md` (FR-AD-001..030, SC-AD-001..008), clarified 2026-08-01.

> **Per-branch plan** (not on `main`). This is the `impl/nextjs` implementation plan for shared spec `011`. Unlike `010`, this is a **server-first** feature: it adds the application's first authorization tier, its first append-only log, and its first runtime-settings store. The client work is small and deliberately non-load-bearing — every guarantee in this spec is enforced server-side (FR-AD-002).

## Summary

Deliver spec 011 in seven increments. **AD0** adds the authorization foundation: a `Principal` seam beside the existing `authenticate()` (unchanged for all 23 calling route files), roles from a configurable verified claim, a `ForbiddenError` → 403 mapping, and a `requirePrincipalAdmin()` guard — shippable alone and already valuable. **AD1** (US1) puts that guard on the three maintainer actions that already exist and are currently reachable by every end user — promotion, pipeline transitions, specification export — which closes the spec's Defect 1; this half is a **bug fix against `003`** (`FR-F-013`/`FR-F-016`), so its tests cite those requirement numbers. **AD2** (US2 + US5) adds cross-user feedback triage *together with* the audit log, because FR-AD-021 requires every cross-user read to be recorded and this is the first such read — closing Defect 2, the one that makes the feedback feature unusable in production. **AD3** (US3) adds the read-only support view over a target user's kitchen data. **AD4** (US4) adds readiness checks, the AI kill switch, usage counters, and cache/limit controls. **AD5** (US6) adds account export and two-phase soft-delete erasure with restore and purge. **AD6** (US7) adds runtime-adjustable operational content. **AD7** verifies, cascades docs, and hands off.

**No new npm dependency.** `jose` already verifies and returns the full JWT payload — roles are a claim read, not a new integration. Mongoose supplies the TTL index; the settings cache and usage counters are ordinary collections.

**Deliberate sequencing departure from spec priority:** the spec ranks audit at US5/P5, but the plan lands it in **AD2** alongside the first cross-user capability. Shipping cross-user reads before the log that records them would knowingly deploy an unaudited privileged surface. Spec priority orders *user value*; this orders *safety*.

## Technical Context

**Language/Version**: TypeScript (strict) on Node 20 / React 18 / Next.js 15 App Router — one process on `:3000`.
**Primary Dependencies**: existing only — `jose` (already the OIDC verifier; the role claim comes from the payload it already returns), `mongoose` (TTL index, atomic `$inc` upsert), `zod` (admin request validation, as every controller already does). **No new npm dependency**; no new service, no state library, no embeddings (CLAUDE.md §14).
**Storage**: MongoDB — **four new collections**, all small and admin-scoped: `admin_audit_logs` (TTL-indexed, 90d), `account_erasures`, `runtime_settings`, `ai_usage_counters`. **No change to any existing schema** except one field-semantics fix: `pipelineItem.promotedBy` records the acting administrator rather than the record author (FR-AD-012).
**Testing**: Vitest node-env handler tests under `tests/server/` for every admin route, including one **table-driven refusal matrix** (`tests/server/admin-authorization.test.ts`) enumerating every admin route × method to evidence SC-AD-001's "100%". RTL for the admin views. Playwright gains `e2e/admin.e2e.ts` covering the triage journey (CLAUDE.md §8 per-feature rule). Existing suite is the regression floor: **797 unit tests / 76 files green** at branch point.
**Target Platform**: existing web app; admin surfaces are same-origin routes in the same process.
**Project Type**: web — single `packages/client` package (UI + Route Handlers + `src/server`).
**Performance Goals**: constitution §IV unchanged. Authorization adds **zero** additional token verifications (D1 — the principal is derived from the single existing verify). The erasure check in the principal seam adds one indexed lookup per request, cached per-request; the settings accessor is cached in-process (D9). Readiness checks are bounded and live on their own route, never on the hot path.
**Constraints**: server-only modules keep `import 'server-only'`; extensionless `@server/*` imports; thin handlers over `src/server/controllers/*`; RFC 7807 for every error including the new 403; complexity ≤10 per function; explicit return types; no `any`; `exactOptionalPropertyTypes` respected. The dev auth seam must remain unreachable in production (FR-AD-004) by *inheriting* the existing two-flag guard, not by a parallel check.
**Scale/Scope**: ~23 existing route files read but **only 3 modified** (the maintainer actions); ~14 new route files; 4 new models; 4 new controllers; ~6 new components + 1 new route group.

## Constitution Check

*Gate evaluated against root `constitution.md` (v3.1.1) + `CLAUDE.md` §7/§8/§14. Re-check after Phase 1 design: PASS.*

- **Strict typing / no `any` / explicit return types** PASS — `Principal`, `AuditEntry`, `RuntimeSettingKey` (a typed union, not free strings) and `ErasureState` are declared types; every new function carries an explicit return type; optional fields are spread-omitted per `exactOptionalPropertyTypes`.
- **Thin handlers, extracted logic** PASS — every admin route is `connectDb()` → `requirePrincipalAdmin()` → parse → controller → `NextResponse.json`, with all logic in `src/server/controllers/admin-*.ts` so it is testable without HTTP.
- **RFC 7807 for all errors** PASS — the new 403 goes through `problemResponse()` exactly as the existing 401 does (`route-helpers.ts:24-34`), so the shape is unchanged and clients need no new parsing.
- **Zero lint warnings / complexity ≤10** PASS — `npm run lint` gates every phase. The erasure purge is the only function at risk; it is written as a table of `{ model, field }` iterated once, not a six-branch sequence.
- **TDD** PASS — every phase starts with failing tests citing FR numbers, e.g. `it('refuses promotion for a non-admin principal (FR-AD-010 / FR-F-013)')`. The AD1 tests deliberately cite **`003`'s** requirement numbers because that half is a bug fix (CLAUDE.md §11).
- **Coverage ≥70% client threshold; >80% for logic** PASS — the new server logic (role extraction, erasure state, settings resolution) is pure and directly unit-tested; the `vitest.config.ts` threshold remains the enforced floor.
- **Per-user isolation (`001` FR-036)** PASS *and strengthened* — non-admin behaviour is byte-identical; cross-user access exists **only** behind `requirePrincipalAdmin()` (FR-AD-016), and the refusal matrix proves it.
- **Auth posture (`002` FR-D-007/008)** PASS — roles ride the existing verification; the dev seam's role support lives on the `dev` branch of `resolveMode()`, so production unreachability is inherited rather than re-implemented (Research D2).
- **Rate limiting** PASS — admin routes are low-traffic and single-operator, but the destructive ones (erase, purge, cache flush) take the existing `rateLimit()` helper so a scripted mistake cannot loop.
- **API-first / versioned paths** PASS — everything lands under `/api/v1/admin/**`; no existing path is renamed (that remains deferred, roadmap).
- **Data model principles** PASS — new collections are additive; `expirationStatus` is never written directly (the purge deletes documents, never partially updates them); existing schemas are untouched save `promotedBy`'s attribution fix.
- **No new service / no Express / no state library / no `src/pages/`** PASS (CLAUDE.md §14) — same process, same patterns, React Context for the small client state.
- **Playwright per-feature coverage** PASS — `e2e/admin.e2e.ts` is a story task, not an afterthought (CLAUDE.md §8).
- **Branch discipline** PASS — `spec.md` came down from `main` by sync; `plan.md`, `research.md`, `tasks.md` are per-branch artifacts and never merge to `main`.

## Data model & contract impact

**Four new collections** (all additive; none touched by existing code paths):

| Collection | Shape | Notes |
|---|---|---|
| `admin_audit_logs` | `{ adminUserId, action, subjectUserId?, subjectType?, subjectId?, at }` | **TTL index** on `at`, 90 days (FR-AD-023). No update/delete path exists anywhere in the app — that absence *is* the append-only enforcement (FR-AD-022). |
| `account_erasures` | `{ userId (unique), erasedAt, purgeAfter, restoredAt? }` | The registry that makes soft delete possible given there is **no `User` model** (Research D7). Indexed on `purgeAfter` for the sweep. |
| `runtime_settings` | `{ key (unique), value, updatedAt, updatedBy }` | Defaults live in code, so an empty collection reproduces today's behaviour exactly (FR-AD-030). |
| `ai_usage_counters` | `{ day, feature, calls }`, unique `(day, feature)` | Atomic `$inc` upsert at each AI service boundary (FR-AD-027). |

**One existing-field semantics change**: `pipelineItem.promotedBy` records the **acting administrator** (FR-AD-012), where today it records the record's own author (`controllers/pipeline.ts:156`). The item's `userId` ownership key is unchanged, so the author's own status view keeps working.

**Contract additions** — see [`contracts/admin-api.md`](contracts/admin-api.md). Summary: `/api/v1/admin/feedback`, `/admin/users/:userId/{data,export,erase,restore}`, `/admin/audit`, `/admin/settings`, `/admin/usage`, `/admin/cache`, `/admin/limits`, plus the new public `/api/health/ready`. Three **existing** routes gain the admin guard with no shape change: `POST /feedback/:id/promote`, `PATCH /pipeline/:id`, `GET /feedback/:id/export`.

**Explicitly unchanged**: `/api/health` stays byte-identical — three shipped consumers depend on it (Docker healthcheck, `scripts/verify-rollout.sh`, the smoke gate) and coupling container health to Mongo and two agents would risk a restart loop (Research D8).

## Project Structure

### Documentation (this feature)

```
specs/011-admin-capabilities/
├── spec.md              # shared (from main) — do not edit here
├── checklists/          # shared (from main)
├── plan.md              # this file (per-branch)
├── research.md          # D1–D12 (per-branch)
├── data-model.md        # collection shapes + indexes (per-branch)
├── contracts/
│   └── admin-api.md     # admin endpoint contract (per-branch)
├── quickstart.md        # manual verification script (per-branch)
└── tasks.md             # generated by /speckit.tasks (per-branch)
```

### Source Code

```
packages/client/
├── app/
│   ├── api/
│   │   ├── health/route.ts              # UNCHANGED (liveness contract)
│   │   ├── health/ready/route.ts        # NEW — readiness (D8)
│   │   └── v1/
│   │       ├── admin/                   # NEW — all admin routes (D4)
│   │       │   ├── feedback/route.ts
│   │       │   ├── users/[userId]/{data,export,erase,restore}/route.ts
│   │       │   ├── audit/route.ts
│   │       │   ├── settings/route.ts
│   │       │   ├── usage/route.ts
│   │       │   ├── cache/route.ts
│   │       │   └── limits/route.ts
│   │       ├── feedback/[id]/promote/route.ts   # +guard (AD1)
│   │       ├── feedback/[id]/export/route.ts    # +guard (AD1)
│   │       └── pipeline/[id]/route.ts           # +guard (AD1)
│   └── admin/                           # NEW — admin UI route group (D11)
└── src/
    ├── server/
    │   ├── auth.ts                      # +authenticatePrincipal (D1/D2)
    │   ├── auth-errors.ts               # +ForbiddenError (D3)
    │   ├── route-helpers.ts             # +403 branch (D3)
    │   ├── admin-guard.ts               # NEW — requirePrincipalAdmin
    │   ├── controllers/admin-*.ts       # NEW
    │   ├── models/{admin-audit-log,account-erasure,runtime-setting,ai-usage-counter}.ts
    │   ├── services/runtime-settings.ts # NEW — cached accessor + kill switch (D9)
    │   └── lib/{audit,account-purge,health-checks}.ts
    ├── components/admin/                # NEW
    ├── views/AdminPage.tsx              # NEW
    └── services/admin.ts                # NEW — browser fetch wrappers
```

## Phase breakdown (each phase ends runnable + tests green; phases = spec stories)

| Phase | Story | Delivers | Shippable alone |
|---|---|---|---|
| **AD0** | foundation | `Principal` seam, role claim extraction, `ForbiddenError`→403, `requirePrincipalAdmin()`, dev-seam roles, refusal-matrix harness | Yes — no behaviour change until AD1 uses it |
| **AD1** | US1 | Guard on promote / pipeline transitions / export; `promotedBy` attribution. **Closes Defect 1.** Tests cite `FR-F-013`/`016` (bug fix) | **Yes — highest value per line in the whole feature** |
| **AD2** | US2 + US5 | Audit collection + `record()`; cross-user feedback triage API + UI. **Closes Defect 2** | Yes |
| **AD3** | US3 | Read-only support view over a target user's inventory / plans / grocery, audited | Yes |
| **AD4** | US4 | `/api/health/ready`; kill switch; usage counters; cache flush; limit inspect/reset | Yes |
| **AD5** | US6 | Account export; two-phase erasure (immediate inaccessibility → restore window → purge sweep) | Yes |
| **AD6** | US7 | Runtime-adjustable operational content over the settings store | Yes |
| **AD7** | — | Full gate, docs cascade (CLAUDE.md §4/§5/§6 + `docs/deployment.md` for the new env vars), quickstart verification log | — |

**AD0 + AD1 are the recommended first release.** Together they are a small diff that closes the privilege hole, and they need no UI at all.

## Complexity Tracking

| Concern | Why it is justified | Cheaper alternative rejected because |
|---|---|---|
| Four new collections | Each backs a distinct FR group with no existing home; none can reuse an existing schema | Overloading an existing collection would couple admin retention/TTL to user data lifecycles |
| A second identity function (`authenticatePrincipal`) | Keeps 23 route files untouched while adding roles (D1) | Widening `authenticate()` is a 23-file diff that buries the 2 lines that matter |
| Erasure registry + purge sweep | There is no `User` model; erasure state has nowhere else to live (D7) | TTL alone would delete the marker and orphan the six collections it points at — exactly what FR-AD-018 forbids |
| Audit landed out of spec-priority order | FR-AD-021 requires the first cross-user read to be recorded | Shipping AD2 without audit means a knowingly unaudited privileged surface |

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| **Keycloak realm role not actually present in the token** — the whole feature is inert without it | AD0's first task is a live-token spike: dump the verified payload in `dev` and confirm the claim path before building on it. `AUTH_ROLES_CLAIM` is configurable precisely so a different layout is config, not code (D2). One-time Keycloak realm config is a **manual** step (CLAUDE.md §15 boundary) — flag it in the deploy cascade. |
| **Operator locks themselves out** — no admin role issued, admin surfaces unreachable | FR-AD-006: end-user function is unaffected, so the app is never bricked; recovery is a Keycloak role assignment, not a redeploy. Explicitly tested. |
| **403 breaks the client's 401 refresh path** | D3 exists for this: 401 triggers `services/http.ts`'s refresh-and-retry; 403 must not. A test asserts a non-admin gets 403 and no refresh is attempted. |
| **Purge is irreversible and deletes across six collections** | Two-phase design means purge only ever runs on data already inaccessible for 30 days; the collection table is a single tested constant; purge is rate-limited and audited. |
| **Audit TTL silently outliving/undercutting the erasure window** if either constant is edited | A test asserts `AUDIT_TTL > ERASURE_WINDOW` from the constants themselves (D6), so the invariant fails loudly rather than drifting. |
| **Admin UI implies enforcement** | The refusal matrix (D12) tests the API directly, never through the UI; SC-AD-008 makes that explicit. |

## Out of scope

Carried from the spec, restated so planning cannot quietly re-absorb them: backup automation and restore drills; Redis-backed rate limiting (E5); telemetry export (E6); graded admin tiers and self-service role management; impersonation (decided out 2026-08-01); the OpenAPI document (CR-013); route renames (deferred); and any change to end-user feature behaviour beyond removing maintainer capabilities from end users.
