# Tasks: Authentication & Authorization — `impl/vite`

**Input**: [`spec.md`](spec.md) (shared) + [`plan.md`](plan.md) (this branch)
**Tests**: included (the spec's SC-D-* require them; TDD — write the failing test first)
**Format**: `[ID] [P?] [Story] Description` — `[P]` = parallelizable (different files, no dep)
**Stories**: US1 = authenticated access · US2 = reject invalid/missing · US3 = no cross-user (FR-036)

> Per-branch tasks for the **Express middleware** enforcement (`plan.md`). The auth seam already exists (`app.use('/api/v1', authMiddleware)`), so there are **no per-route changes** — fewer tasks than `impl/nextjs`. Out of scope: token issuance / login UI / IdP config.

## Phase 1: Setup
- [ ] T001 Add `jose` to `packages/server` deps (`npm i jose -w packages/server`).
- [ ] T002 [P] Add `AUTH_MODE` (`oidc` | `dev`) to `.env.example` (`AUTH_ISSUER`/`AUTH_AUDIENCE`/`AUTH_JWKS_URI` already documented; Express loads root `.env` via `tsx --env-file`).

## Phase 2: Foundational (verifier + 401 mapping) — ⚠️ blocks Phase 3
- [ ] T003 [P] [US2] Create `src/lib/auth-errors.ts`: `AuthError` (carries 401 + safe `detail`). *(NodeNext — local imports use `.js`.)*
- [ ] T004 [US2] **(RED)** Write `tests/unit/auth.test.ts` (FR-D-002/003/007): in `oidc` mode, sign a JWT in-test (`jose.SignJWT` + generated RSA key) verified against a **local** JWKS → `req.userId = sub`; **expired / wrong-iss / wrong-aud / tampered / missing-`sub` / missing-token** → `AuthError`; `dev` mode → `X-User-Id`.
- [ ] T005 [US1] [US2] **(GREEN)** Rewrite `src/middleware/auth.ts` `authMiddleware` (async): `dev` seam (`X-User-Id`) + `oidc` (`jwtVerify` + module-cached `createRemoteJWKSet`, check `iss`/`aud`/`exp`) + **prod guard**; set `req.userId = sub`; wrap body in try/catch → `next(new AuthError(...))` (Express 4 doesn't auto-forward async throws). Makes T004 pass.
- [ ] T006 [US2] `src/middleware/error-handler.ts`: add `instanceof AuthError` → `problemJson(res, 401, 'Unauthorized', err.detail)` before the generic 500.

**Checkpoint:** verifier + error mapping unit-green before integration.

## Phase 3: Enforce + verify (seam already wired in app.ts — no router edits)
- [ ] T007 [US1] [US2] [US3] Add `tests/integration/auth.test.ts` (supertest, `oidc` mode): missing/invalid token → **401**; valid token → **200** with data scoped to `sub`; another user's id → **404** (FR-036).
- [ ] T008 [P] [US2] Assert `GET /health` (mounted **outside** `/api/v1`) stays reachable without a token — FR-D-006.
- [ ] T009 [US1] Run the suite — confirm the existing **199** integration/unit tests stay green via the `dev` seam (they set `X-User-Id`).

**Checkpoint:** all `/api/v1` protected at the single seam; health public; SC-D-001/002 met.

## Phase 4: Polish & gate
- [ ] T010 [P] Docs: `CLAUDE.md` (auth note + `AUTH_MODE`), `.env.example`, `docs/DEVELOPMENT.md`.
- [ ] T011 Gate: `npm test` (incl. the `tsc` build that `validate-e2e` runs) + `npm run lint` green; `bash scripts/validate-e2e.sh --no-agent` green (dev seam).

## Dependencies
`T001 → T003 → T004 → T005`; `T006` after `T003`; `T007` after `T005`+`T006`; `T009` after `T005`; `T010/T011` last. `[P]` tasks (`T002`, `T003`, `T008`, `T010`) touch distinct files.

## Traceability
FR-D-001→T005(seam) · FR-D-002→T004/T005 · FR-D-003→T005 · FR-D-004(FR-036)→T007 · FR-D-005→T006/T007 · FR-D-006→T008 · FR-D-007→T004/T009 · FR-D-008→T005(prod guard) · FR-D-009→(client UX, separate frontend task).

## Cross-impl note
Same contract/lib/env/dev-seam as `impl/nextjs`; the difference is **no per-handler change** here (one middleware) vs. swapping 12 handlers there. The 401/404 outcomes are identical, so a future shared `scripts/smoke-test.sh` auth step passes against both stacks.

## Next
`/speckit.analyze` (spec ↔ plan ↔ tasks) → implement TDD. Shared-spec edits stay on `main`; this file + code stay on `impl/vite`.
