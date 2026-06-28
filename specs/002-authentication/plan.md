# Implementation Plan: Authentication & Authorization — `impl/vite`

**Branch**: `impl/vite` | **Date**: 2026-06-27 | **Spec**: [`spec.md`](spec.md) (shared, on `main`)
**Input**: Feature specification from `specs/002-authentication/spec.md`

> **Per-branch plan.** The spec is the shared, topology-agnostic contract; this plan pins it to the **Express** stack. `impl/nextjs` has its own `plan.md` realizing the same contract in the Next.js server layer.

## Summary

Replace the `packages/server/src/middleware/auth.ts` `authMiddleware` dev stub (trusted `X-User-Id` header) with real OIDC Bearer-JWT verification. Enforcement is already centralized at `app.use('/api/v1', authMiddleware)`, so this is a **one-seam** change: the middleware verifies the token, sets `req.userId` from the `sub` claim, and on failure calls `next(AuthError)` → the existing `errorHandler` maps it to a 401 Problem JSON. Controllers already scope by `req.userId` (FR-036), so they are untouched. A `dev` mode preserves the header stub so the 199-test Jest suite and local dev keep working without an IdP.

## Technical Context

**Language/Version**: TypeScript 5 (strict, NodeNext — `.js` import extensions), Express 4, Node 20
**Primary Dependencies**: `jose` (JWT verify + `createRemoteJWKSet`) — **new**. Reuses `middleware/error-handler.ts`, `lib/errors.ts`.
**Storage**: unchanged (MongoDB/Mongoose; identity is the token `sub`)
**Testing**: Jest + ts-jest + supertest; `mongodb-memory-server`
**Project Type**: web (Vite SPA `:5173` + Express API `:3001`)
**Performance**: CR-D-002 — JWKS cached in-process; synchronous endpoints stay within CR-008 (<200ms p95)
**Constraints**: `helmet`/`cors` already present; no secrets in logs (CR-D-003)

## Constitution Check

- **Security:** real signature/iss/aud/exp validation (CR-001/CR-002); production identity from the verified token, not a client header (closes the `X-User-Id` stub); FR-036 isolation already in controllers.
- **Testing:** dev/test seam (FR-D-007) keeps the 199 Jest tests green; new tests cover the verifier + 401 paths.
- **API-First:** errors stay RFC-7807 Problem JSON via `lib/errors.ts`.
- **Code quality:** no new state libs; complexity ≤10. ✅ No violations.

## Key Design Decisions

1. **Keep the single enforcement seam.** Auth is already one line — `app.use('/api/v1', authMiddleware)` ahead of all routers. The health endpoint is mounted **outside** `/api/v1`, so it stays public (FR-D-006) with no change. This is the structural advantage of the Express stack for this feature (one middleware vs. the Next per-handler `await`).
2. **`authMiddleware` becomes async + verifying** (`packages/server/src/middleware/auth.ts`):
   - **`dev` mode** (default when `NODE_ENV !== 'production'` and `AUTH_MODE !== 'oidc'`): `req.userId = X-User-Id ?? 'anonymous'` (today's behavior) — the FR-D-007 seam.
   - **`oidc` mode** (`AUTH_MODE=oidc`, required in production): `jwtVerify(token, JWKS, { issuer: AUTH_ISSUER, audience: AUTH_AUDIENCE })` → `req.userId = payload.sub`. JWKS via module-level `createRemoteJWKSet(new URL(AUTH_JWKS_URI))` (cached).
   - On any failure → `next(new AuthError(detail))`. Wrap the async body in try/catch so rejections reach `next` (Express 4 doesn't auto-forward async throws).
   - **Prod guard:** `NODE_ENV === 'production' && AUTH_MODE !== 'oidc'` → throw at startup (the dev seam can't ship to prod — FR-D-007/FR-D-008).
3. **`errorHandler` maps `AuthError` → 401** (`middleware/error-handler.ts`): add an `instanceof AuthError` branch before the generic 500, emitting `problemJson(res, 401, 'Unauthorized', …)`.
4. **No router/controller changes** — `req.userId` already flows from middleware into every route.

## Project Structure (this feature, impl/vite)

```
packages/server/src/
├── middleware/
│   ├── auth.ts            # authMiddleware: dev seam + OIDC verify + next(AuthError)  (REWRITE)
│   └── error-handler.ts   # AuthError → 401 Problem JSON                              (EDIT)
├── lib/
│   └── auth-errors.ts     # AuthError class                                           (NEW)
└── (app.ts unchanged — the `app.use('/api/v1', authMiddleware)` seam already exists)

packages/server/tests/
├── unit/auth.test.ts          # verifier: local-signed JWT + local JWKS; 401 paths     (NEW)
└── integration/auth.test.ts   # oidc mode: no/invalid token → 401; valid → 200 + scope (NEW)
```

## Phasing (TDD; tasks land in tasks.md)

- **D-VT-1** — add `jose`; `lib/auth-errors.ts` (`AuthError`); rewrite `auth.ts` (dev + oidc + prod guard + async try/catch→next; module-cached JWKS). Unit-test the verifier with a locally-generated RSA key (jose `SignJWT` + local `JWKS`): valid→`sub`, expired/wrong-aud/wrong-iss/tampered/missing→`AuthError`.
- **D-VT-2** — `error-handler.ts`: `AuthError` → `problemJson(res, 401, 'Unauthorized', …)`.
- **D-VT-3** — integration tests (supertest, `oidc` mode): no/invalid token = 401; valid token = 200 + correct scoping; cross-user still 404 (existing isolation test). Existing 199 tests stay green via the dev seam (they set `X-User-Id`).
- **D-VT-4** — docs: CLAUDE.md auth note (`AUTH_MODE`), `.env.example`, `docs/DEVELOPMENT.md`.
- **Gate:** `bash scripts/validate-e2e.sh --no-agent` (dev seam) green; `npm test` (incl. `tsc` build) + lint green.

## Testing Without a Live IdP (FR-D-007)

- **Existing suites** run in `dev` mode (set `X-User-Id`) — unchanged.
- **Verifier tests** run in `oidc` mode against a **local** key: sign JWTs in-test with `jose.SignJWT` and verify against a local `JWKS` (or stub `createRemoteJWKSet`). No network, no real IdP.

## Cross-impl equivalence

Same contract as `impl/nextjs`, same Problem JSON, same 401/404 semantics, same `dev`/`oidc` modes and env vars (`AUTH_MODE`, `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URI`), same `jose` library — only the **insertion point** differs (one Express middleware here vs. `authenticate()` in the Next server layer there). The shared `scripts/smoke-test.sh` can later gain an auth step that passes against both.

## Complexity / Risks

- **Express async middleware:** must try/catch and `next(err)` (no auto-forwarding in Express 4). Low risk (one function).
- **NodeNext imports:** local imports need `.js` extensions (`jose` is a package import — unaffected).
- **JWKS rotation:** `createRemoteJWKSet` auto-refetches on unknown `kid`.

## Next Workflow Steps
`tasks.md` (mimic `/speckit.tasks`) → `/speckit.analyze` (spec ↔ this plan ↔ tasks) → implement TDD. Shared-spec changes go on `main`; this plan + code stay on `impl/vite`.
