# Tasks: Authentication & Authorization — `impl/nextjs`

**Input**: [`spec.md`](spec.md) (shared) + [`plan.md`](plan.md) (this branch)
**Tests**: included (the spec's SC-D-* require them; TDD — write the failing test first)
**Format**: `[ID] [P?] [Story] Description` — `[P]` = parallelizable (different files, no dep)
**Stories**: US1 = authenticated access · US2 = reject invalid/missing · US3 = no cross-user (FR-036)

> Per-branch tasks for the **Next.js server-layer** enforcement (`plan.md` decision 1). Out of scope: token issuance / login UI / IdP config.

## Phase 1: Setup
- [ ] T001 Add `jose` to `packages/client` deps (`npm i jose -w packages/client`).
- [ ] T002 [P] Add `AUTH_MODE` (`oidc` | `dev`) to `.env.example` + a `packages/client/.env.local` note (`AUTH_ISSUER`/`AUTH_AUDIENCE`/`AUTH_JWKS_URI` already documented).

## Phase 2: Foundational (verifier + 401 mapping) — ⚠️ blocks Phase 3
- [ ] T003 [P] [US2] Create `src/server/auth-errors.ts`: `AuthError` (carries 401 + a safe, non-leaking `detail`).
- [ ] T004 [US2] **(RED)** Write `tests/server/unit/auth.test.ts` (FR-D-002/003/007): in `oidc` mode, sign a JWT in-test (`jose.SignJWT` + a generated RSA key) and verify against a **local** JWKS → returns `sub`; **expired / wrong-iss / wrong-aud / tampered-signature / missing-`sub` / missing-token** → `AuthError`; `dev` mode → `X-User-Id`.
- [ ] T005 [US1] [US2] **(GREEN)** Rewrite `src/server/auth.ts`: `authenticate(request): Promise<string>` — `dev` seam (`X-User-Id`) + `oidc` (`jwtVerify` + `globalThis`-cached `createRemoteJWKSet`, check `iss`/`aud`/`exp`) + **prod guard** (`NODE_ENV=production && AUTH_MODE!=='oidc'` → throw); throw `AuthError` on any failure. Makes T004 pass.
- [ ] T006 [US2] `src/server/route-helpers.ts` `withRoute()`: add `instanceof AuthError` → `problemResponse(401,'Unauthorized',err.detail)` **before** the generic 500; extend `tests/server/middleware.test.ts` (throwing `AuthError` → 401).

**Checkpoint:** verifier + error mapping done and unit-green before touching handlers.

## Phase 3: Enforce on endpoints
- [ ] T007 [US1] Swap all 12 `app/api/v1/**/route.ts` handlers: `getUserId(request)` → `await authenticate(request)` (each already runs inside `withRoute`, so `AuthError` → 401 automatically).
- [ ] T008 [P] [US2] Add public `app/api/health/route.ts` (`{status:'ok'}`, no `authenticate`) — FR-D-006.
- [ ] T009 [US1] [US2] [US3] Add `tests/server/auth.handlers.test.ts` (node-env, `oidc` mode): missing/invalid token → **401** on a representative protected route; valid token → **200** with data scoped to `sub`; another user's id → **404** (FR-036).
- [ ] T010 [US1] Run the suite — confirm the existing `tests/server/*.test.ts` stay green via the `dev` seam (they send `X-User-Id`).

**Checkpoint:** all `/api/v1` protected; health public; SC-D-001/002 demonstrably met.

## Phase 4: Polish & gate
- [ ] T011 [P] Docs: `CLAUDE.md` (§6 auth note → `authenticate` + `AUTH_MODE`; §7 handler pattern), `.env.example`, `docs/DEVELOPMENT.md` (run with `AUTH_MODE=dev` locally).
- [ ] T012 Gate: `npm test` + `npm run lint` green; `bash scripts/validate-e2e.sh --no-agent` green (dev seam). *(Optional follow-up: add an auth step to the shared `scripts/smoke-test.sh`.)*

## Dependencies
`T001 → T003 → T004 → T005`; `T006` after `T003`; `T007` after `T005`; `T009` after `T007`+`T008`; `T010` after `T007`; `T011/T012` last. `[P]` tasks (`T002`, `T003`, `T008`, `T011`) touch distinct files.

## Traceability
FR-D-001→T007 · FR-D-002→T004/T005 · FR-D-003→T005 · FR-D-004(FR-036)→T009 · FR-D-005→T006/T009 · FR-D-006→T008 · FR-D-007→T004/T010 · FR-D-008→T005(prod guard) · FR-D-009→(client UX, separate frontend task).

## Next
`/speckit.analyze` (spec ↔ plan ↔ tasks) → implement TDD. Shared-spec edits stay on `main`; this file + code stay on `impl/nextjs`.
