# Feature Specification: Authentication & Authorization (OAuth 2.0 / OIDC)

**Feature Branch**: `002-authentication`
**Created**: 2026-06-27
**Status**: Draft
**Input**: Phase D — replace the development `X-User-Id` header stub with production OAuth 2.0 / OIDC authentication on all `/api/v1` endpoints, building on spec `001`'s FR-036 (per-user data isolation), CR-001 (OIDC), CR-002 (JWT signature validation), Key Entities → User, and Assumption 12.

> **Shared contract (both implementations).** This spec is authored on `main` and inherited by **both** `impl/vite` and `impl/nextjs` (Phases B/C/D are spec-level per `BRANCHING_STRATEGY.md §5`). It is deliberately **topology-agnostic**: it defines *what* must hold (token validation, identity, isolation, error shape) — never *how* (Express middleware vs Next.js server layer). The enforcement point is a per-branch **plan.md** concern.
>
> **FR numbering:** Phase D requirements use the `FR-D-xxx` prefix to avoid collision with `001`'s `FR-0xx`.
>
> **Revision 2026-08-05 (backlog #16 — session control).** This spec shipped *authentication* but never session **termination**: the client has always exported a working `logout()` that **nothing in the app ever calls**, so there is no way to sign out at all; `login()` is reachable only from the post-`401` banner, so there is no proactive sign-in and no indication of *who* is signed in; and that `logout()` clears local tokens only, never ending the IdP session — so signing in again silently returns the same user. Spec `011` made all three matter: with a real administrator persona you must be able to switch between an admin and an ordinary user to see what each can, and on a shared device the next person inherits an **administrator** session. New requirements continue the `FR-D-xxx` sequence (FR-D-011+). Decisions are recorded under Clarifications.

## Clarifications

### Session 2026-08-05 (backlog #16 — user session; all FIXED)

- Q: How far should sign-out go? → A: **Full RP-initiated logout.** Clear the local session *and* end the IdP session via its end-session endpoint, returning to the app signed out. Local-only clearing was rejected because it does not solve the problem that motivates this work: the IdP session would survive, so the next sign-in silently returns the **same** user — personas cannot be switched and a shared device still leaks the session. Cost accepted: a post-logout redirect must be registered with the IdP (a manual, human-only step, like spec `011`'s role).
- Q: Where does the account control live? → A: **On the Home screen, plus the desktop sidebar footer.** Explicitly **not** a fifth navigation item — that navigation is a four-item layout tuned across five viewport classes and has already shipped clipping defects under exactly this pressure — and explicitly **not** a second floating affordance, which would share the hard-won geometry of the existing feedback bubble. Home is already the landing surface, so the control is where a user arrives.
- Q: Should the signed-in identity be shown? → A: **Yes, with an administrator marker.** The app already exposes `{userId, isAdmin}` for the caller (spec `011`), so this costs nothing and is what makes "which persona am I?" answerable at a glance — the question this whole item exists to make answerable.
- Q: Does signing out need confirmation? → A: **No.** Sign-out is reversible (sign in again) and cheap; a confirmation would add friction to the very action being made available. This deliberately differs from spec `003` FR-F-020's confirmable *delete*, which is irreversible.

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

### User Story 4 - I can sign in, see who I am, and sign out (Priority: P2)

As a signed-in user, I want to see which account I am using and to end that session deliberately, so that I can hand the device to someone else, or switch between an administrator and an ordinary account to check what each can see.

**Why this priority**: P2 rather than P1 because authentication itself already works — this is the session *control* around it. It is nonetheless the gap that makes spec `011`'s two personas untestable in a running deployment and leaves a shared device holding an administrator session.

**Independent Test**: Sign in; confirm the identity shown matches the account; sign out; confirm the app returns to a signed-out state and that signing in again **prompts for credentials** rather than silently restoring the same user. Then sign in as a different account and confirm the identity display changes.

**Acceptance Scenarios**:

1. **Given** a signed-in user, **When** they look at the app, **Then** the account they are signed in as is visible without navigating anywhere special, and an administrator is marked as such.
2. **Given** a signed-in user, **When** they sign out, **Then** the local session is cleared **and** the identity-provider session is ended, and they are returned to the application in a signed-out state.
3. **Given** a user who has just signed out, **When** they sign in again, **Then** the identity provider **prompts for credentials** — it does not silently restore the previous session.
4. **Given** a signed-out user, **When** they open the app, **Then** a sign-in action is available **without** having to first trigger a failed request.
5. **Given** an administrator signs out and an ordinary user signs in on the same device, **When** the ordinary user uses the app, **Then** no administrator capability is available to them and the identity display reflects the ordinary account.
6. **Given** a sign-out that cannot reach the identity provider, **When** it fails, **Then** the local session is cleared regardless and the user is told the device is signed out but the provider session may persist — never silently left signed in.

### Edge Cases
- **Expired token** → `401` with a detail distinguishing expiry (so the client can refresh/re-auth).
- **Valid signature but missing `sub` claim** → `401` (no usable identity).
- **JWKS key rotation / signing key not found** → the verifier refreshes keys; a still-unverifiable token → `401`.
- **Clock skew** → small bounded leeway on `exp`/`nbf`.
- **Dev/test mode** → a deterministic identity is accepted without a live IdP; this path MUST be impossible to enable in production.
- **Sign-out while a request is in flight** (session revision 2026-08-05): the local session is cleared regardless; the in-flight response MUST NOT repopulate the UI with the previous user's data.
- **Sign-out with unsaved input** (e.g. text typed into quick-add): it is lost, and that is accepted — sign-out is explicit and reversible. No confirmation is required (FR-D-015).
- **Identity provider unreachable at sign-out**: local session cleared, user informed the provider session may persist (FR-D-014).
- **Two tabs open, sign-out in one**: the other tab MUST NOT keep operating as the signed-out user once its next request is made — it follows the ordinary `401` re-authentication path (FR-D-009).
- **Sign-out when never signed in**: a no-op, never an error.

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

- **FR-D-011**: A signed-in user MUST be able to **end their session deliberately** from within the application. Sign-out MUST clear the local session **and** end the identity-provider session, so a subsequent sign-in **prompts for credentials** rather than silently restoring the same account.
- **FR-D-012**: The application MUST show **which account is signed in**, and MUST mark an account that holds administrator privilege (spec `011` FR-AD-001). The indicator MUST reflect the *current* session — after a sign-out and a different sign-in it MUST show the new account.
- **FR-D-013**: A **sign-in action MUST be available to a signed-out user without first provoking a failed request**. FR-D-009's post-`401` prompt remains, but it MUST NOT be the only route to signing in.
- **FR-D-014**: If ending the identity-provider session fails (provider unreachable, network error), the **local session MUST still be cleared**, and the user MUST be told the device is signed out while the provider session may persist. The system MUST NOT leave the user silently signed in.
- **FR-D-015**: Sign-out MUST NOT require a confirmation step. *(It is reversible and cheap; this deliberately differs from spec `003` FR-F-020's confirmable **delete**, which is irreversible.)*
- **FR-D-016**: After sign-out, **no user data from the previous session MUST remain readable** in the client — including anything held in client-side stores or caches — so the next person on the device cannot see the previous user's kitchen, plan, or feedback.
- **FR-D-017**: The session controls MUST NOT be added as a new primary-navigation destination. *(Constraint, not preference: that navigation is a four-item layout tuned across five viewport classes — spec `010` FR-RS-002 — and has already shipped clipping defects under this exact pressure. Placement is otherwise a per-branch `plan.md` concern.)*

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

- **SC-D-005**: A signed-in user can sign out from the running application in **one action**, with no developer tools and no clearing of browser storage by hand.
- **SC-D-006**: After sign-out, signing in again **prompts for credentials 100% of the time** — the previous session is never silently restored.
- **SC-D-007**: An administrator can switch to an ordinary account and back **entirely in-app**, and at every point the displayed identity matches the account whose data and capabilities are actually in force.
- **SC-D-008**: After sign-out, **zero** records belonging to the previous user are readable from the client.
## Assumptions & Dependencies
1. An external OIDC provider exists and is configured via the already-documented env vars: `AUTH_ISSUER`, `AUTH_AUDIENCE`, `AUTH_JWKS_URI`.
2. **Out of scope:** token issuance, the login UI, and the identity provider's own configuration. This feature *consumes and validates* tokens and isolates data — it does not mint them.
3. Builds directly on `001`: FR-036 (isolation), CR-001 (OIDC), CR-002 (JWT validation), Key Entities → User, Assumption 12 (email/password + OAuth 2.0/OIDC; social login is a later enhancement).

## Both-Implementation Plan (informative — detail lives in each branch's plan.md)
- **Shared (this spec, on `main`):** the contract above. Both impls inherit it on `git merge main`. The shared acceptance scenarios get IDs (`AUTH-US1-S1`, …) in `checklists/`.
- **`impl/vite` enforcement:** Express auth middleware replacing the `packages/server/src/middleware/auth.ts` stub; applied ahead of the `/api/v1` routers.
- **`impl/nextjs` enforcement:** a verifier in the Next server layer replacing the `src/server/auth.ts` `getUserId()` stub — invoked from `withRoute()` / the route handlers (or Next middleware). Same contract, same Problem JSON.
- **Finding-routing (per `BRANCHING_STRATEGY.md §5`):** spec gaps → fix here on `main` (both inherit); backend enforcement bugs → the branch where they occur; auth UX → per-branch frontend.
