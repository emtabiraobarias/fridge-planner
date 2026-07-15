# Feature Specification: Authentication & Authorization (OAuth 2.0 / OIDC)

**Feature Branch**: `002-authentication`
**Created**: 2026-06-27
**Status**: Draft
**Input**: Phase D — replace the development `X-User-Id` header stub with production OAuth 2.0 / OIDC authentication on all `/api/v1` endpoints, building on spec `001`'s FR-036 (per-user data isolation), CR-001 (OIDC), CR-002 (JWT signature validation), Key Entities → User, and Assumption 12.

> **Shared contract (both implementations).** This spec is authored on `main` and inherited by **both** `impl/vite` and `impl/nextjs` (Phases B/C/D are spec-level per `BRANCHING_STRATEGY.md §5`). It is deliberately **topology-agnostic**: it defines *what* must hold (token validation, identity, isolation, error shape) — never *how* (Express middleware vs Next.js server layer). The enforcement point is a per-branch **plan.md** concern.
>
> **FR numbering:** Phase D requirements use the `FR-D-xxx` prefix to avoid collision with `001`'s `FR-0xx`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Authenticated access to my own data (Priority: P1)

A returning user makes API requests carrying a valid access token; the system identifies them from the token and serves only their data.

**Why this priority:** Without trusted identity, FR-036 isolation cannot be enforced — every other guarantee depends on this.

**Acceptance Scenarios:**
1. **Given** a valid Bearer token for user A, **When** A calls any `/api/v1` resource endpoint, **Then** the response contains only A's data and any mutation affects only A's data.
2. **Given** a valid token whose subject is a brand-new user, **When** they first call `GET /api/v1/inventory`, **Then** they receive an empty, successful result (first-use), not an error.

### User Story 2 - Unauthenticated / invalid requests are rejected (Priority: P1)

Requests without a valid token never reach data.

**Acceptance Scenarios:**
1. **Given** no `Authorization` header, **When** any `/api/v1` resource endpoint is called, **Then** the response is `401` with an RFC 7807 Problem JSON body and no user data.
2. **Given** a token that is malformed, expired, has an invalid signature, or has the wrong issuer/audience, **When** any resource endpoint is called, **Then** the response is `401` and no user data is returned.
3. **Given** no token, **When** the public health endpoint is called, **Then** it responds normally (no auth required).

### User Story 3 - No cross-user access (Priority: P1) — enforces FR-036

An authenticated user cannot reach another user's data.

**Acceptance Scenarios:**
1. **Given** user A's valid token and an id that belongs to user B, **When** A issues GET/PUT/PATCH/DELETE for that id, **Then** the response is `404 Not Found` (existence is not revealed) and B's data is unchanged.
2. **Given** A's token, **When** A lists any resource, **Then** results are scoped to A across inventory, meal plans, grocery lists, and the ingredient set sent to the recommendation agent.

### Edge Cases
- **Expired token** → `401` with a detail distinguishing expiry (so the client can refresh/re-auth).
- **Valid signature but missing `sub` claim** → `401` (no usable identity).
- **JWKS key rotation / signing key not found** → the verifier refreshes keys; a still-unverifiable token → `401`.
- **Clock skew** → small bounded leeway on `exp`/`nbf`.
- **Dev/test mode** → a deterministic identity is accepted without a live IdP; this path MUST be impossible to enable in production.

## Requirements *(mandatory)*

### Functional Requirements
- **FR-D-001**: System MUST require a valid OAuth 2.0 / OIDC Bearer access token on every `/api/v1` resource endpoint (inventory, meal-plans, grocery-lists, recommendations). *(Elevates CR-001.)*
- **FR-D-002**: System MUST validate each token's signature against the provider's JWKS and verify `iss` (issuer), `aud` (audience), and `exp` (expiry, with bounded clock-skew leeway). *(Elevates CR-002.)*
- **FR-D-003**: System MUST derive the authenticated user's identity from the token's stable subject (`sub`) claim and use it as the `userId` for all data scoping — **replacing** the `X-User-Id` development header.
- **FR-D-004**: System MUST scope every data operation to the authenticated user per FR-036 (`001`); cross-user read/modify/delete MUST fail as `404 Not Found` without revealing whether the resource exists.
- **FR-D-005**: System MUST reject missing, malformed, expired, bad-signature, or wrong-issuer/audience tokens with HTTP `401` and an RFC 7807 Problem JSON body, returning no user data.
- **FR-D-006**: System MUST keep non-resource endpoints (the health check) publicly accessible without a token.
- **FR-D-007**: System MUST provide a configurable development/test authentication mode that injects a deterministic identity without a live IdP (so automated suites and local dev need no external dependency). Production MUST use real OIDC validation and MUST NOT accept the dev mode.
- **FR-D-008**: The `X-User-Id` development header MUST NOT be a valid production authentication path once real auth is enforced.
- **FR-D-009**: The client MUST surface an authentication failure (e.g., `401`) as a prompt to (re-)authenticate, not a generic error. *(UX — realized per-branch in each frontend.)*
- **FR-D-010**: An expired access token MUST be renewed **transparently** (OIDC refresh-token grant, single-flight, with a one-shot retry of the failed request) without user interaction and without losing client-side state; the re-authentication prompt of FR-D-009 is reserved for the case where renewal itself fails. The IdP session MUST allow at least **half a day (12 h) of idle time** before renewal fails (IdP realm setting: SSO Session Idle ≥ 12 h, Session Max ≥ 12 h; the access-token lifespan itself stays short). *(Added 2026-07-16 from user feedback 6a56a2cc: users lost unsaved changes when auth timed out.)*

### Constraints (Non-Functional)
- **CR-D-001 (topology-agnostic):** the above MUST hold regardless of server architecture. The enforcement mechanism is per-branch: `impl/vite` via Express middleware; `impl/nextjs` via the Next.js server layer (`src/server`). See each branch's `plan.md`.
- **CR-D-002:** token validation MUST keep synchronous endpoints within CR-008 (<200ms p95) — JWKS keys cached in-process; no per-request round-trip to the IdP after warm-up.
- **CR-D-003:** tokens, keys, and secrets MUST never be written to logs.

### Key Entities
- **User**: identified by the OIDC `sub` claim (previously the `X-User-Id` stub value). Display attributes (email, name) MAY be read from token claims. Per-user data isolation (FR-036) is unchanged — only the **source of identity** changes from a trusted header to a verified token.

## Success Criteria *(mandatory)*
- **SC-D-001**: 100% of `/api/v1` resource requests lacking a valid token are rejected with `401` and zero data leakage (verified in tests).
- **SC-D-002**: A user can only ever access their own data — cross-user attempts return `404` across all resource types (verified in tests).
- **SC-D-003**: Token validation adds negligible latency to synchronous endpoints (JWKS cached) — they remain within CR-008's <200ms p95.
- **SC-D-004**: The full automated suite runs green with **no live IdP**, via the dev/test seam (FR-D-007).

## Assumptions & Dependencies
1. An external OIDC provider exists and is configured via the already-documented env vars: `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URI`.
2. **Out of scope:** token issuance, the login UI, and the identity provider's own configuration. This feature *consumes and validates* tokens and isolates data — it does not mint them.
3. Builds directly on `001`: FR-036 (isolation), CR-001 (OIDC), CR-002 (JWT validation), Key Entities → User, Assumption 12 (email/password + OAuth 2.0/OIDC; social login is a later enhancement).

## Both-Implementation Plan (informative — detail lives in each branch's plan.md)
- **Shared (this spec, on `main`):** the contract above. Both impls inherit it on `git merge main`. The shared acceptance scenarios get IDs (`AUTH-US1-S1`, …) in `checklists/`.
- **`impl/vite` enforcement:** Express auth middleware replacing the `packages/server/src/middleware/auth.ts` stub; applied ahead of the `/api/v1` routers.
- **`impl/nextjs` enforcement:** a verifier in the Next server layer replacing the `src/server/auth.ts` `getUserId()` stub — invoked from `withRoute()` / the route handlers (or Next middleware). Same contract, same Problem JSON.
- **Finding-routing (per `BRANCHING_STRATEGY.md §5`):** spec gaps → fix here on `main` (both inherit); backend enforcement bugs → the branch where they occur; auth UX → per-branch frontend.
