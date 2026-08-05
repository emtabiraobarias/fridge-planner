# Tasks: Authentication & Authorization — `impl/nextjs`

**Input**: [`spec.md`](spec.md) (shared) + [`plan.md`](plan.md) (this branch)
**Tests**: included (the spec's SC-D-* require them; TDD — write the failing test first)
**Format**: `[ID] [P?] [Story] Description` — `[P]` = parallelizable (different files, no dep)
**Stories**: US1 = authenticated access · US2 = reject invalid/missing · US3 = no cross-user (FR-036)

> Per-branch tasks for the **Next.js server-layer** enforcement (`plan.md` decision 1). Out of scope: token issuance / login UI / IdP config.

## Phase 1: Setup
- [x] T001 Add `jose` to `packages/client` deps (`npm i jose -w packages/client`).
- [x] T002 [P] Add `AUTH_MODE` (`oidc` | `dev`) to `.env.example` + a `packages/client/.env.local` note (`AUTH_ISSUER`/`AUTH_AUDIENCE`/`AUTH_JWKS_URI` already documented).

## Phase 2: Foundational (verifier + 401 mapping) — ⚠️ blocks Phase 3
- [x] T003 [P] [US2] Create `src/server/auth-errors.ts`: `AuthError` (carries 401 + a safe, non-leaking `detail`).
- [x] T004 [US2] **(RED)** Write `tests/server/unit/auth.test.ts` (FR-D-002/003/007): in `oidc` mode, sign a JWT in-test (`jose.SignJWT` + a generated RSA key) and verify against a **local** JWKS → returns `sub`; **expired / wrong-iss / wrong-aud / tampered-signature / missing-`sub` / missing-token** → `AuthError`; `dev` mode → `X-User-Id`. Edge cases (spec): a token just outside `exp` still fails despite small **clock-skew** leeway; an **unknown `kid` (key rotation)** triggers a JWKS refetch.
- [x] T005 [US1] [US2] **(GREEN)** Rewrite `src/server/auth.ts`: `authenticate(request): Promise<string>` — `dev` seam (`X-User-Id`) + `oidc` (`jwtVerify` + `globalThis`-cached `createRemoteJWKSet`, check `iss`/`aud`/`exp` with a small `clockTolerance`) + **prod guard** (`NODE_ENV=production && AUTH_MODE!=='oidc'` → throw); throw `AuthError` on any failure. Makes T004 pass.
- [x] T006 [US2] `src/server/route-helpers.ts` `withRoute()`: add `instanceof AuthError` → `problemResponse(401,'Unauthorized',err.detail)` **before** the generic 500; extend `tests/server/middleware.test.ts` (throwing `AuthError` → 401).

**Checkpoint:** verifier + error mapping done and unit-green before touching handlers.

## Phase 3: Enforce on endpoints
- [x] T007 [US1] Swap all 12 `app/api/v1/**/route.ts` handlers: `getUserId(request)` → `await authenticate(request)` (each already runs inside `withRoute`, so `AuthError` → 401 automatically).
- [x] T008 [P] [US2] Add public `app/api/health/route.ts` (`{status:'ok'}`, no `authenticate`) — FR-D-006.
- [x] T009 [US1] [US2] [US3] Add `tests/server/auth.handlers.test.ts` (node-env, `oidc` mode): missing/invalid token → **401** on a representative protected route; valid token → **200** with data scoped to `sub`; another user's id → **404 for each resource type** (inventory, meal-plans, grocery-lists) (FR-036, SC-D-002).
- [x] T010 [US1] Run the suite — confirm the existing `tests/server/*.test.ts` stay green via the `dev` seam (they send `X-User-Id`).

**Checkpoint:** all `/api/v1` protected; health public; SC-D-001/002 demonstrably met.

## Phase 3b: Client auth UX (FR-D-009)
- [x] T011 [US2] [frontend] On a `401` from the API, surface a **(re-)authentication prompt** instead of a generic error — handle in `src/services/*` (the fetch layer) → an `auth-required` state consumed by context/UI (e.g. an "session expired — please sign in" banner). **Out of scope:** the actual login UI / token acquisition; this task only turns a `401` into a sign-in prompt. (FR-D-009) + a component/context test.

## Phase 4: Polish & gate
- [x] T012 [P] Docs: `CLAUDE.md` (§6 auth note → `authenticate` + `AUTH_MODE`; §7 handler pattern), `.env.example`, `docs/DEVELOPMENT.md` (run with `AUTH_MODE=dev` locally).
- [x] T013 Gate: `npm test` + `npm run lint` green; `bash scripts/validate-e2e.sh --no-agent` green (dev seam). *(Optional follow-up: add an auth step to the shared `scripts/smoke-test.sh`.)*

## Dependencies
`T001 → T003 → T004 → T005`; `T006` after `T003`; `T007` after `T005`; `T009` after `T007`+`T008`; `T010` after `T007`; `T011` after `T007` (needs a 401-able API); `T012/T013` last. `[P]` tasks (`T002`, `T003`, `T008`, `T012`) touch distinct files.

## Traceability
FR-D-001→T007 · FR-D-002→T004/T005 · FR-D-003→T005 · FR-D-004(FR-036)→T009 · FR-D-005→T006/T009 · FR-D-006→T008 · FR-D-007→T004/T010 · FR-D-008→T005(prod guard) · **FR-D-009→T011** · SC-D-001→T009 · SC-D-002→T009 (all resource types) · SC-D-003→design (JWKS cache; no perf-test task — load testing out of scope) · SC-D-004→T010.

## Next
`/speckit.analyze` ✅ 2026-06-27 (spec ↔ plan ↔ tasks; A1 added T011/FR-D-009, A2 tightened T009, A3 added clock-skew/rotation — see ROADMAP). → **implement TDD**. Shared-spec edits stay on `main`; this file + code stay on `impl/nextjs`.

---

## Session control (2026-08-05, backlog #16 — spec `002` US4 / FR-D-011..017)

**Tests**: INCLUDED — every phase starts with failing tests citing FR-D numbers.

### S1 — RP-initiated sign-out (FR-D-011/014/015/016)

- [x] T101 [P] Failing test: `endSessionUrl()` builds `${issuer}/protocol/openid-connect/logout` with `post_logout_redirect_uri` = the app origin, and `id_token_hint` when an id token is held (FR-D-011)
- [x] T102 [P] Failing test: `logout()` clears BOTH storage keys and then navigates — asserted as a navigation, since that is what makes FR-D-016 true rather than six context resets (plan D-S1)
- [x] T103 [P] Failing test: when the provider URL cannot be built (unconfigured/unreachable), `logout()` STILL clears local state and hard-navigates to the origin (FR-D-014) — the failure path must not be the only one that leaks
- [x] T104 Implement `logout()` in `src/context/AuthContext.tsx`: clear tokens → redirect to the end-session endpoint; on any failure, `window.location.replace('/')`. No confirmation (FR-D-015)
- [x] T105 [P] Test: no previous-user data survives — render a provider tree with seeded state, sign out, assert the app navigated (the state cannot outlive a page load) (FR-D-016)

### S2 — Account surface (FR-D-012/017)

- [x] T106 [P] Generalise `hooks/useIsAdmin` → `useMe()` returning `{userId, isAdmin} | null`; keep `useIsAdmin` as a thin wrapper so spec 011's callers are untouched (plan D-S3)
- [x] T107 [P] Failing tests for `components/account/AccountPanel.tsx`: shows the signed-in id; shows an **Admin** badge only when `isAdmin`; renders a Sign out control; renders nothing while identity is unknown (no flash of the wrong state)
- [x] T108 Build `AccountPanel` and mount it on **Home** (`views/HomePage`)
- [x] T109 Mount `AccountPanel` in the **desktop sidebar footer** only (`app/nav.tsx`, sidebar mode) — NOT a nav item (FR-D-017)
- [x] T110 [P] Regression test: the primary nav still renders exactly its four destinations at every viewport class (FR-D-017 / spec 010 FR-RS-002)

### S3 — Proactive sign-in (FR-D-013)

- [x] T111 [P] Failing test: a signed-out user is offered sign-in **without** a prior failed request — `AccountPanel` shows Sign in when unauthenticated
- [x] T112 Implement the signed-out branch of `AccountPanel`; leave `AuthBanner`'s post-401 prompt (FR-D-009) untouched

### S4 — Verify + cascade

- [x] T113 [P] Playwright `e2e/session.e2e.ts`: identity visible on Home; admin badge for an admin; sign-out clears the session; the nav still has four items
- [x] T114 Full gate: lint · `npm test` · `test:e2e` · `validate-e2e --no-agent`
- [x] T115 [P] Cascade `CLAUDE.md` (§6 note on the post-logout redirect) + `docs/deployment.md` (the MANUAL Keycloak post-logout redirect URI registration)
