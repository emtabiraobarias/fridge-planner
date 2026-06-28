# Implementation Plan: Authentication & Authorization — `impl/nextjs`

**Branch**: `impl/nextjs` | **Date**: 2026-06-27 | **Spec**: [`spec.md`](spec.md) (shared, on `main`)
**Input**: Feature specification from `specs/002-authentication/spec.md`

> **Per-branch plan.** The spec is the shared, topology-agnostic contract; this plan pins it to the **Next.js Route Handler** stack. `impl/vite` has its own `plan.md` realizing the same contract with Express middleware.

## Summary

Replace the `src/server/auth.ts` `getUserId()` dev stub (trusted `X-User-Id` header) with real OIDC Bearer-JWT verification, performed in the **Next server layer** and surfaced through the existing `withRoute()` wrapper. Identity comes from the verified `sub` claim and flows unchanged into the controllers, which already scope every query by `userId` (FR-036). A `dev` mode preserves the header stub so the existing suites and local dev keep working without an IdP.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Next.js 15 App Router, Node 20
**Primary Dependencies**: `jose` (JWT verify + `createRemoteJWKSet` for JWKS; ESM, no native deps) — **new**. Reuses `src/server/{http,route-helpers,auth}.ts`.
**Storage**: unchanged (MongoDB/Mongoose; no auth tables — identity is the token `sub`)
**Testing**: Vitest (node env) under `tests/server/`; `mongodb-memory-server`
**Project Type**: web (single Next.js app serving UI + `/api/v1`)
**Performance**: CR-D-002 — JWKS cached in-process; no per-request IdP round-trip after warm-up; synchronous endpoints stay within CR-008 (<200ms p95)
**Constraints**: enforce in-process (no trusted-header hop); `server-only`; no secrets in logs (CR-D-003)

## Constitution Check

- **Security:** real signature/iss/aud/exp validation (CR-001/CR-002); identity never from a client-settable header in production (closes the `X-User-Id` stub); FR-036 isolation already enforced in controllers.
- **Testing:** dev/test seam (FR-D-007) keeps the existing ~60 server tests green; new tests cover the verifier + 401 paths.
- **API-First:** errors stay RFC-7807 Problem JSON via `problemResponse()`.
- **Code quality:** no new state libs; `server-only` guard; complexity ≤10. ✅ No violations.

## Key Design Decisions

1. **Enforce in the server layer, not Next middleware.** Next `middleware.ts` runs on the edge runtime — it can't share the Mongoose connection, and handing identity to handlers would mean re-trusting a header (re-introducing the `X-User-Id` risk) or double-verifying. Verifying in-process co-locates identity derivation with data access. (`jose` runs fine in the Node runtime.)
2. **`getUserId()` → `async authenticate(request): Promise<string>`** in `src/server/auth.ts`:
   - **`dev` mode** (default when `NODE_ENV !== 'production'` and `AUTH_MODE !== 'oidc'`): return `X-User-Id` header (today's behavior) — the FR-D-007 seam.
   - **`oidc` mode** (`AUTH_MODE=oidc`, required in production): `jwtVerify(token, JWKS, { issuer: AUTH_ISSUER, audience: AUTH_AUDIENCE })` → return `payload.sub`. JWKS via `createRemoteJWKSet(new URL(AUTH_JWKS_URI))`, cached on `globalThis` (like `db.ts`).
   - On any failure → throw `AuthError` (carries 401 + safe detail).
   - **Prod guard:** if `NODE_ENV === 'production'` and `AUTH_MODE !== 'oidc'` → throw at first call (dev seam can't be enabled in prod — FR-D-007/FR-D-008).
3. **`withRoute()` maps `AuthError` → 401** Problem JSON (an `instanceof` branch before the generic 500). Since every handler body already runs inside `withRoute`, making `authenticate` throw is enough — no per-handler try/catch.
4. **Handlers:** swap `const userId = getUserId(request)` → `const userId = await authenticate(request)` in all 12 route files. No controller changes (they already take `userId`).
5. **Public health endpoint** (FR-D-006): add `app/api/health/route.ts` returning `{status:'ok'}` without calling `authenticate`.

## Project Structure (this feature, impl/nextjs)

```
packages/client/
├── src/server/
│   ├── auth.ts            # authenticate(request) — dev seam + OIDC verify + AuthError  (REWRITE)
│   ├── route-helpers.ts   # withRoute: AuthError → 401                                   (EDIT)
│   └── auth-errors.ts     # AuthError class                                              (NEW)
├── app/api/
│   ├── health/route.ts    # public                                                       (NEW)
│   └── v1/**/route.ts     # getUserId → await authenticate (×12)                          (EDIT)
└── tests/server/
    └── auth.test.ts       # verifier (local-signed JWT + local JWKS), 401 paths, dev seam (NEW)
```

## Phasing (TDD; tasks land in tasks.md)

- **D-NX-1** — add `jose`; `auth-errors.ts` (`AuthError`); rewrite `auth.ts` `authenticate()` (dev + oidc + prod guard, globalThis-cached JWKS). Unit-test the verifier with a locally-generated RSA key (jose `SignJWT` + a local `JWKS`): valid→sub, expired/wrong-aud/wrong-iss/tampered/missing→`AuthError`.
- **D-NX-2** — `withRoute()`: `AuthError` → `problemResponse(401, 'Unauthorized', …)`.
- **D-NX-3** — swap all 12 handlers to `await authenticate(request)`; add public `app/api/health/route.ts`. Existing handler tests stay green via the dev seam (they send `X-User-Id`).
- **D-NX-4** — handler-level tests: `oidc` mode → no/invalid token = 401, valid token = 200 + correct scoping; cross-user still 404 (existing isolation tests).
- **D-NX-5** — docs: CLAUDE.md auth note (`authenticate`, `AUTH_MODE`), `.env.example` (`AUTH_MODE`), `docs/DEVELOPMENT.md`.
- **D-NX-6** *(frontend, FR-D-009 — added by `/speckit.analyze`)* — client surfaces a `401` as a (re-)authentication prompt: handle in `src/services/*` → an `auth-required` state in context/UI, not a generic error. Login UI / token acquisition stays out of scope.
- **Gate:** `bash scripts/validate-e2e.sh --no-agent` (dev seam) green; `npm test` + lint green.

## Testing Without a Live IdP (FR-D-007)

- **Existing suites** run in `dev` mode (set `X-User-Id`) — unchanged.
- **Verifier tests** run in `oidc` mode against a **local** key: generate an RSA keypair in-test, sign JWTs with `jose.SignJWT`, and verify against a local `JWKS` (pass a `jose` local key set, or stub `createRemoteJWKSet`). No network, no real IdP.

## Complexity / Risks

- **Async identity:** `authenticate` is async (was sync) — handlers must `await`. Low risk (mechanical; all sites inside `withRoute`).
- **Edge vs Node:** keep verification in the Node server layer (decision 1) — avoid Next middleware/edge entirely for v1.
- **JWKS rotation:** `createRemoteJWKSet` auto-refetches on unknown `kid`; cache on `globalThis` to avoid refetch storms in dev hot-reload.

## Next Workflow Steps
`tasks.md` (mimic `/speckit.tasks`) → `/speckit.analyze` cross-check (spec ↔ this plan ↔ tasks) → implement TDD. Shared-spec changes go on `main`; this plan + code stay on `impl/nextjs`.
