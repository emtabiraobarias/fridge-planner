# Research: Account creation & management (spec 013)

Resolves the technical unknowns the spec deliberately left open. Each decision names what was
chosen, why, and what was rejected.

---

## R1 — Where the internal identifier comes from

**Decision**: A server-generated `ObjectId`, stored as the `_id` of a new `Account` document, and
used as `userId` everywhere `sub` is used today.

**Rationale**: Every user-keyed collection already stores `userId` as an indexed string, so the
migration rewrites a value in place rather than changing types or indexes. Mongoose already
generates ObjectIds, so there is no new dependency. The value never leaves the server except as an
opaque string.

**Alternatives considered**: a UUIDv4 (equivalent, but adds a generator for nothing); reusing the
first-seen `sub` as the canonical id (defeats the purpose — the whole point is that no provider
subject is load-bearing); an email-derived key (emails change, and `FR-AC-034` exists because of it).

---

## R2 — Where identity links live

**Decision**: An `identities` array **embedded in the Account document**, each entry
`{ issuer, subject, linkedAt }`, with a unique compound index on `(identities.issuer,
identities.subject)`.

**Rationale**: The lookup that matters runs on **every authenticated request** — resolve
`(issuer, sub)` → account. Embedded means one indexed read, no join. The cardinality is tiny: one
entry per provider a user has ever signed in through, realistically one or two. A unique index is
what makes "one subject resolves to at most one account" a database guarantee rather than
application intent — the same reasoning `012` used for the `{userId, feedbackRecordId}` index on
lifecycle items.

**Alternatives considered**: a separate `identity_links` collection (a second read per request for
no benefit at this cardinality); storing links on a session (they must outlive sessions).

---

## R3 — Resolving identity without breaking statelessness

**Decision**: Resolve `(issuer, sub)` → `Account` inside `authenticate()`, per request, with no
process-local cache.

**Rationale**: Constitution VI requires share-nothing processes. A per-process identity cache would
make two app instances disagree after an erasure or an email refresh — precisely the state the
erasure check exists to prevent. The read is a single indexed lookup on a collection with one
document per user; `refuseIfErased` already performs a comparable read on every request, so the
shape is established and the cost is understood.

**Alternatives considered**: an in-memory LRU (fails Constitution VI, and stale entries defeat
`FR-AC-043`); putting the internal id in the token (we do not issue tokens; the provider does).

---

## R4 — The adapter boundary

**Decision**: One module, `src/server/services/identity-provider.ts`, exporting
`createUser`, `sendVerification`, `initiatePasswordReset`, `suspend`, `resume`, `deleteUser` —
named in the app's vocabulary, with a Keycloak implementation behind it. No other module imports a
provider SDK or calls a provider URL.

**Rationale**: `FR-AC-019`/`FR-AC-020`/`FR-AC-042`. Every operation is a standard provider-admin
concept: Keycloak `enabled:false`, Auth0 `blocked:true`, Okta `lifecycle/suspend`, Entra
`accountEnabled:false` are one intent spelled four ways. Confining the spelling to one file makes a
provider change a replacement of that file. An architecture test enforces it, the same way
`no-deploy-imports.test.ts` enforces that the lifecycle layer cannot merge or deploy.

**Alternatives considered**: calling the admin API from controllers (the coupling this spec exists
to avoid); a generic SCIM client (SCIM is not universally supported and is heavier than six
operations need).

---

## R5 — How the migration runs

**Decision**: `packages/client/scripts/migrate-account-identities.mjs`, run as a one-off admin task,
idempotent, with a `--check` mode that reports what it would do and changes nothing.

**Rationale**: Constitution XII and `FR-AC-007`. `012` shipped `migrate-lifecycle-stages.mjs` in
exactly this shape and the reasoning held: a startup migration that fails is invisible. Idempotency
matters because the operator will run `--check` first, then the real thing, and may re-run after a
partial failure. It creates one Account per distinct `sub`, records the link, and rewrites `userId`
across the user-keyed stores.

**Alternatives considered**: migrating lazily on each user's next sign-in (leaves the database in
two shapes indefinitely, and every query would need to handle both); a startup hook (rejected by
Constitution XII).

---

## R6 — Where the email refresh happens

**Decision**: In `authenticate()`, immediately after resolving the account: if the token carries a
verified email differing from the stored one, write the new value.

**Rationale**: `FR-AC-034`. This is the one place every authenticated request passes through, so the
refresh cannot be forgotten by a new route. The write is conditional, so the steady-state cost is a
comparison, not a write.

**Alternatives considered**: a scheduled reconciliation job (no scheduler exists — `011` notes the
same for erasure purge); refreshing only at sign-in (the app does not observe sign-in, only requests
carrying tokens).

---

## R7 — Rate limiting a signed-out endpoint

**Decision**: Reuse `rateLimit(key, limit, windowMs)` with the key derived from the request source
address: `register:${ip}` at 5/min and `password-reset:${ip}` at 10/min.

**Rationale**: `FR-AC-018`/`FR-AC-044`. The limiter already exists and is module-level state; every
current key is `something:${userId}`, and these are the first that cannot be. Behind Caddy the
source address must come from the forwarded header, which is trustworthy here because Caddy is the
only ingress and sets it.

**Alternatives considered**: keying on the submitted email (an attacker varies it freely); no limit
(rejected by the spec); a CAPTCHA (a new third-party dependency and a new outbound call, for a
household-scale app).

---

## R8 — Test strategy

**Decision**: TDD per Constitution, with the provider adapter stubbed at the module boundary in
server tests, and an e2e that drives registration through the real controls against the existing
mock-agent pattern.

**Rationale**: The adapter is the seam. Stubbing it keeps server tests hermetic — no Keycloak in
CI — while the architecture test proves nothing else calls the provider. `012` learned that an e2e
which only calls the API proves the server works but never that anyone can reach it, so
registration, display-name change and self-delete each need a driven journey.

**Alternatives considered**: a Keycloak testcontainer (slow, and CI has no Docker budget for it
today); mocking `fetch` globally (hides which module made the call, which is the thing under test).

---

## Open, deferred to implementation

- **Display-name validation** — length and character rules. Low impact; decide with the form.
- **Export format** — `011`'s admin export already produces JSON; self-service should match it
  rather than invent a second shape.
- **Data volume** — household scale. No sharding, pagination or archival concerns.
