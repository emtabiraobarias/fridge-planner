# Research — Administration Capabilities (`impl/nextjs`)

**Branch**: `011-implement` · **Date**: 2026-08-01 · **Spec**: [`spec.md`](spec.md) · **Plan**: [`plan.md`](plan.md)

Design decisions for spec `011`. Every claim about current behaviour was read from the shipped `impl/nextjs` tree at `b8e675b`; file:line references are to that revision.

---

## D1 — Add a `Principal` seam beside `authenticate()`; do not change its signature

**Decision**: Introduce `authenticatePrincipal(request): Promise<Principal>` in `src/server/auth.ts`, where

```
interface Principal { userId: string; roles: readonly string[]; isAdmin: boolean }
```

and reduce the existing export to a one-line wrapper:

```
export async function authenticate(request: Request): Promise<string> {
  return (await authenticatePrincipal(request)).userId;
}
```

**Why**: `authenticate()` is called by **23 route files** and returns a bare `string`. Widening its return type to an object would touch every one of them, turning a security change into a 23-file refactor whose diff hides the two lines that matter. The wrapper keeps every existing handler byte-identical, makes the change reviewable, and means a handler *opts in* to role awareness by calling the new function. Verification cost is unchanged: the token is verified exactly once per request either way.

**Rejected**: (a) changing `authenticate()`'s return type — 23-file blast radius for no benefit; (b) a separate `requireAdmin(request)` that verifies the token a *second* time — doubles JWKS/verify work per admin request and can disagree with the first verification under key rotation; (c) middleware-based enforcement — Next middleware runs on the Edge runtime where `jose` JWKS caching and our Node-only `server-only` modules do not apply, and it would put the security decision somewhere other than the handler it protects.

---

## D2 — Roles come from a configurable claim path; the dev seam gets roles too, inheriting the two-flag production guard

**Decision**: In `oidc` mode, read roles from the verified payload at a configurable path, defaulting to Keycloak's realm-role location:

- `AUTH_ROLES_CLAIM` (default `realm_access.roles`) — dotted path to a string array.
- `AUTH_ADMIN_ROLE` (default `admin`) — the role name that grants administration.

In `dev` mode, `X-User-Roles` (comma-separated) supplies roles alongside the existing `X-User-Id`, so tests and local development can exercise both personas.

**Why**: Keycloak is already the deployed IdP (`docker-compose.prod.yml`), and realm roles land at `realm_access.roles`; client roles at `resource_access.<client>.roles`. Making the path configurable avoids hard-coding one Keycloak convention into the app, satisfying FR-AD-001's "verified identity-provider claims" without betting on a single layout. Defaults mean zero configuration for the deployment we actually have.

**The production safety is inherited, not re-invented.** `resolveMode()` (`auth.ts:24-38`) already throws unless `AUTH_MODE=oidc` in production, requiring the deliberate two-flag `AUTH_ALLOW_DEV=true` acknowledgment otherwise. Because `X-User-Roles` is read **only** on the `dev` branch of that same function, admin-via-header is unreachable in production for exactly the reason the user seam already is — FR-AD-004 is satisfied by construction rather than by a second, separately-maintained check. A test asserts this explicitly.

**Roles are never read from the request body or a query parameter**, and never persisted to or read from our database — the application stays stateless with respect to privilege (spec Clarifications).

---

## D3 — A distinct `ForbiddenError` → 403; authenticated-but-unauthorized must not read as unauthenticated

**Decision**: Add `ForbiddenError` to `src/server/auth-errors.ts` mirroring `AuthError`, and extend `withRoute()` (`route-helpers.ts:24-34`) with one branch:

```
if (err instanceof ForbiddenError) return problemResponse(403, 'Forbidden', err.detail);
```

**Why**: FR-AD-003 requires the refusal to be *distinguishable from an authentication failure*. Today every auth-layer throw maps to 401 (`route-helpers.ts:28-30`). Returning 401 to a validly-authenticated non-admin would tell the client "your session is broken", and `services/http.ts` treats 401 as a trigger for the FR-D-010 token-refresh-and-retry path — so a non-admin hitting an admin route would burn a refresh and retry a request that can never succeed. 403 is both correct and necessary to avoid that loop.

---

## D4 — Admin capability lives under `/api/v1/admin/**`, guarded in the handler

**Decision**: New route segment `app/api/v1/admin/**`. Every handler's first two statements are `connectDb()` then `const principal = await requirePrincipalAdmin(request)`, where that helper calls `authenticatePrincipal()` and throws `ForbiddenError` unless `isAdmin`. Existing non-admin routes are untouched except where a maintainer action already lives on one (D5).

**Why**: A dedicated namespace makes "is this endpoint privileged?" answerable from the path, which is what makes SC-AD-001 testable as a sweep rather than a checklist. Guarding *in the handler* rather than in shared middleware keeps the decision adjacent to the thing it protects and matches the established thin-handler pattern (CLAUDE.md §7). Enforcement is server-side and independent of any UI (FR-AD-002).

**Not a new service** — same Next process, same `src/server/controllers/*` structure (CLAUDE.md §14).

---

## D5 — The three already-shipped maintainer actions are *moved behind* the guard, not duplicated

**Decision**: `POST /feedback/:id/promote`, `PATCH /pipeline/:id`, and `GET /feedback/:id/export` become admin-only **in place** — the existing routes gain the admin guard rather than being re-implemented under `/admin`. Cross-user *listing* (FR-AD-009) is a genuinely new capability and does land under `/admin/feedback`.

**Why**: These three are the FR-AD-010/011/013 payload and the concrete fix for the spec's Defect 1. They already exist, already have tests, and already have the correct semantics — the only thing wrong is *who may call them*. Moving them wholesale to `/admin` would churn the client, the e2e specs, and `003`'s shipped contract for no behavioural gain. Adding the guard is a ~1-line change per handler plus its refusal test.

**This is the bug-fix half of the feature** (spec's *Relationship to `003`*): the tests added here cite `FR-F-013`/`FR-F-016` and assert refusal, per CLAUDE.md §11's rule that a bug-fix test names the requirement it restores.

**Promotion attribution** (FR-AD-012) is the one behavioural change: `promotedBy` currently records the record's own `userId` (`controllers/pipeline.ts:156`); it must record the **acting administrator**, which is now a different person from the author. The pipeline item's `userId` — its ownership key — stays the record author's, so existing `{ userId }`-scoped reads keep working for the author's own status view.

---

## D6 — The audit log is a collection with a TTL index; append-only is enforced by having no other code path

**Decision**: New model `src/server/models/admin-audit-log.ts`:

```
{ adminUserId, action, subjectUserId?, subjectType?, subjectId?, at }
```

with a Mongo **TTL index** on `at` (`expireAfterSeconds: 90 * 24 * 3600`) implementing FR-AD-023's 90-day retention, and **no update or delete path anywhere in the application** — the only exported operations are `record()` and `list()`.

**Why**: "Append-only" (FR-AD-022) cannot be enforced by MongoDB permissions from inside the app, so it is enforced structurally: no controller, service, or route offers a mutation. A TTL index makes retention automatic and needs no scheduler — which matters because **this codebase has no background-job infrastructure** and spec `008` deliberately chose recompute-on-view over one.

**The retention margin is load-bearing** (spec Clarifications, FR-AD-023): 90-day TTL vs a 30-day erasure window means an erasure's audit entry survives 60 days past the point the erasure became irreversible. A test asserts `TTL > recovery window` from the constants so a future edit to either number cannot silently break the property.

**Sequencing consequence — audit must ship with US2, not at its spec priority.** The spec ranks audit US5/P5, but FR-AD-020 requires *every* cross-user access to be recorded, and US2 is the first capability that reads another user's data. Implementing audit later would knowingly ship an unaudited privileged surface. The plan therefore lands the audit collection in the same phase as cross-user triage; spec priority orders *value*, not build order.

---

## D7 — Soft-delete erasure needs an account registry, because there is no user collection

**Decision**: New model `account-erasure.ts` — `{ userId (unique), erasedAt, purgeAfter, restoredAt? }` — plus:

1. **Immediate inaccessibility** (FR-AD-018) enforced in `authenticatePrincipal()`: a principal whose `userId` has an *active* erasure is refused. This is one check in one place, so no controller can forget it, and it covers the user's own access and every admin surface at once.
2. **Restore** (FR-AD-019) clears the record while `now < purgeAfter`; after that it refuses explicitly rather than appearing to succeed.
3. **Purge** deletes every document keyed to that `userId` across the **six** collections that carry one — `inventory-item`, `meal-plan`, `grocery-list`, `ingredient-alias`, `feedback-record`, `pipeline-item` — then the erasure record itself.

**Why an account registry at all**: there is **no `User` model** in this codebase; a user exists only as a `userId` string replicated across those six collections, with identity owned by Keycloak. Erasure state therefore has nowhere to live but a new collection. The registry is also what makes the *complete* purge list explicit and testable — FR-AD-018's "no orphans" is asserted by enumerating collections and checking each is empty for that user.

**Purge trigger, given no scheduler**: the sweep runs (a) when an administrator opens the accounts view or explicitly triggers it, and (b) opportunistically at the start of any admin accounts operation. Both are cheap (indexed `purgeAfter` lookup). **Rejected**: a cron/worker — the app has none and adding one for this is disproportionate (CLAUDE.md §14's spirit); a TTL index — TTL deletes only the erasure record, not the six collections of data it points at, so it would silently orphan exactly what FR-AD-018 forbids.

**Consequence to accept**: purge is *no earlier than* 30 days, not *exactly* at 30 days — it happens on the first admin touch after expiry. The spec requires the data be unreachable at 30 days (it already is, from step 1) and purged after the window, which this satisfies. The plan states this explicitly rather than implying punctuality it cannot deliver.

---

## D8 — `/api/health` stays exactly as it is; readiness is a new sibling route

**Decision**: Leave `app/api/health/route.ts` byte-identical — `{ status, version }`, public, no dependency checks. Add `app/api/health/ready/route.ts` returning per-dependency status with a bounded timeout per check.

**Why**: `/api/health` is a **shipped operational contract with three consumers**: the Docker/compose healthcheck, `scripts/verify-rollout.sh` (which polls it for `version` after every release), and the smoke gate. Adding dependency checks to it would make container health depend on Mongo and two agents — so a transient agent blip could mark the app unhealthy and trigger a restart loop, and it would slow the rollout poll that exists precisely because a silent stall once went unnoticed for a day. Liveness and readiness answer different questions (FR-AD-022) and must not share a route.

Readiness is **public and unauthenticated like `/api/health`**, but reports only coarse per-dependency status — never connection strings, versions, or error bodies — so it stays safe to expose while remaining useful to a probe.

Each check is bounded (FR-AD-023 → *degraded*, never hanging): a short timeout wrapper around a `Mongo ping`, a `GET /health` to each agent, and a config-presence check for the recipe providers.

---

## D9 — Runtime settings: one small collection, one cached accessor, code-owned defaults

**Decision**: New model `runtime-setting.ts` — `{ key (unique), value, updatedAt, updatedBy }` — read through `services/runtime-settings.ts` with a short-TTL in-process cache and a **code-owned default per key**. Backs both the AI kill switch (FR-AD-026) and adjustable operational content (FR-AD-030).

**Why**: FR-AD-030's "no redeploy" and FR-AD-026's "at runtime" both require persisted state read on the hot path; a cached accessor keeps the cost off it. Defaults living in code means an empty collection reproduces today's behaviour exactly, which is what makes FR-AD-030's third scenario ("no override ever set → behaves as today") true by construction rather than by seeding.

**Single-instance caching is sound today** and consistent with the existing in-memory rate limiter (`rate-limit.ts:12-13`) and recommendation cache; the same multi-instance caveat already recorded for those (Phase E5) applies, and the plan does not pretend otherwise.

**Kill-switch placement**: checked at the *service* boundary (`services/meal-recommender.ts`, `services/parse-assist.ts`, `services/recipe-verifier.ts`, `services/alias-pairing.ts`) rather than in controllers, so every current and future caller inherits it and each already has a graceful no-AI fallback to degrade into (FR-AD-026's "existing fallbacks, not errors"). An in-flight call is not aborted (spec edge case).

---

## D10 — AI usage is a per-day, per-feature counter incremented at the same boundary as the kill switch

**Decision**: New model `ai-usage-counter.ts` — `{ day, feature, calls }`, unique on `(day, feature)`, incremented with an atomic `$inc` upsert at each AI service call site.

**Why**: FR-AD-027 asks only for enough to *notice an anomaly*, not for billing-grade accounting. A per-day-per-feature counter answers "did something spike?" in one query, costs one fire-and-forget upsert per model call, and needs no new infrastructure. Placing it at the same boundary as the kill switch (D9) means the two cannot drift apart — a call that is blocked is a call that is not counted.

**Rejected**: token/cost accounting — the providers' responses do not consistently carry usage in the paths we use, and estimating cost would be a number precise enough to be trusted and wrong enough to mislead.

---

## D11 — The admin UI is a route group that is *hidden*, never the enforcement

**Decision**: `app/admin/**` (Home-style route segment) plus an `useIsAdmin()` derivation from the existing `AuthContext` token. Nav shows the admin entry only when the claim is present.

**Why**: FR-AD-002 makes the server the enforcement point, so the UI's job is only to avoid showing users doors they cannot open. Deriving from the token the client already holds adds no request. **A non-admin who navigates directly to `/admin` sees an empty/refused state because the API refuses (D3/D4), not because the route is secret** — that ordering is what the plan's tests assert, and it is why "hidden" is a UX nicety here rather than a security control.

---

## D12 — Testing strategy: the refusal sweep is the spec's central guarantee

**Decision**: Alongside per-capability tests, add one table-driven `tests/server/admin-authorization.test.ts` that enumerates **every** admin-only route × method and asserts a non-admin principal receives 403 and causes no state change.

**Why**: SC-AD-001 is "100% of maintainer-only actions are refused… when invoked directly against the server". A per-endpoint assertion scattered across files cannot evidence *100%*; one enumerated table can, and it fails loudly when a new admin route is added without a guard — which is the realistic future regression. Playwright coverage (CLAUDE.md §8) adds the admin triage journey; the refusal matrix stays at the API level where it belongs.
