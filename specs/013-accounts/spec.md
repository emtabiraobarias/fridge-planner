# Feature Specification: Account creation & management

**Input**: User description: "Account creation and management feature — the app should make it secure and easy
to self-register. Keycloak was chosen for MVP convenience and may be replaced by another OIDC provider."

> **Why this spec carries identity indirection.** The trigger was self-service accounts, but the blocking
> problem is underneath it: today `userId` **is** the OIDC `sub`, and that value is the primary key of every
> user-owned document across six collections. Changing identity provider issues every user a new `sub` and
> orphans all of their data. That retrofit is strictly cheaper now than after another collection or another
> hundred users, and this spec is where the first user-owned identity record appears anyway — so the two are
> specified together by decision (2026-09-02), not merged by accident.

> **Relationship to prior specs.** `002` owns authenticating a session and ending it; this spec owns the
> account that session belongs to. `011` owns what an *administrator* may do to someone else's account
> (`FR-AD-016..021`); this spec gives the account holder the equivalent over their own, reusing the same
> machinery rather than a second implementation. `001` `FR-036` per-user isolation is unchanged throughout.

## Clarifications

### Session 2026-09-03

- Q: Password reset — does the app trigger the provider's flow, or complete it in-app? → A: The app triggers; the provider completes. The app never handles password material or reset tokens.
- Q: The stored email is what a new issuer matches against — what keeps it from going stale? → A: Both: refresh it from the verified claim on sign-in, AND lock the attribute at the provider so users cannot change it. The lock is defence-in-depth; the refresh is what the app itself guarantees.
- Q: Does the migration rewrite records that merely REFERENCE a user (audit entries, erasure state), or only user-owned data? → A: Owned data only. Audit entries keep the subject as recorded and resolve through the identity table when displayed, preserving `011` FR-AD-022's append-only guarantee.
- Q: A deleted user can still authenticate at the provider and receive a fresh valid token — what stops them re-entering a broken app? → A: Suspend the provider account for the recovery window and delete it at purge; restore resumes it. The app also refuses every request via the existing erasure check.
- Q: `FR-AC-018` requires rate limiting but names no target, which is untestable — what are the limits and what are they keyed on? → A: Per source address, separate buckets: registration 5/min, password reset 10/min.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Someone signs themselves up (Priority: P1)

A person with no account reaches the app, registers with an email address, a password and a display name,
verifies their email, and signs in.

**Why this priority**: Without it there is no self-service at all; every other story presumes an account.

**Independent test**: Register a new address end to end, confirm the account cannot be used before
verification, then sign in and reach the Kitchen.

**Acceptance scenarios**:

1. **Given** a valid email, password and display name, **When** registration is submitted, **Then** the
   account is created at the identity provider and a verification email is sent.
2. **Given** an unverified account, **When** sign-in is attempted, **Then** it is refused and the refusal
   says verification is outstanding.
3. **Given** an email already registered, **When** registration is submitted, **Then** it is refused
   without revealing whether that address exists.
4. **Given** a password that fails the provider's policy, **When** registration is submitted, **Then** the
   provider's reason is shown against the field.

### User Story 2 - A returning user manages their own account (Priority: P2)

The account holder changes their display name, resets their password, and sees which identity they are
signed in as.

**Why this priority**: The account exists (US1) but is otherwise unmanageable without administrator help.

**Independent test**: Change the display name and confirm it survives a reload and a fresh sign-in; complete
a password reset and sign in with the new password.

**Acceptance scenarios**:

1. **Given** a signed-in user, **When** they change their display name, **Then** it is stored and shown
   wherever the account is identified.
2. **Given** a signed-in user, **When** they request a password reset, **Then** the provider's reset flow is
   initiated for their address.
3. **Given** a signed-out user, **When** they request a password reset for a registered address, **Then**
   the same response is returned whether or not the address exists.

### User Story 3 - A user exports or deletes their own data (Priority: P2)

The account holder downloads everything held about them, or deletes their account — with the same two-phase
recovery window an administrator's erasure has.

**Why this priority**: Equal in weight to US2 and independently testable, but it reuses `011` machinery
rather than introducing new surface.

**Independent test**: Export and confirm every user-keyed collection appears; delete, confirm access stops
immediately, restore inside the window, confirm the data returns.

**Acceptance scenarios**:

1. **Given** a signed-in user, **When** they export, **Then** they receive everything keyed to them across
   every user-keyed store.
2. **Given** a signed-in user, **When** they delete their account, **Then** access stops immediately and the
   data becomes unreadable, while remaining recoverable for the retention window.
3. **Given** the only remaining administrator, **When** they attempt to delete their own account, **Then**
   it is refused.

### User Story 4 - Identity survives a change of provider (Priority: P3)

An existing user signs in for the first time through a newly configured identity provider and finds their
inventory, meal plans, grocery lists and feedback intact.

**Why this priority**: No user-visible value until a migration happens, but the data model it requires must
exist from the start — retrofitting it later means rewriting the key of every user-owned document.

**Independent test**: Point the app at a second issuer, sign in as an existing user with the same verified
address, confirm the internal identity is reused and all prior data resolves.

**Acceptance scenarios**:

1. **Given** an existing internal identity with a verified email, **When** that person first signs in
   through a different issuer presenting the same verified email, **Then** the new `(issuer, sub)` pair is
   linked to the existing internal identity and their data resolves unchanged.
2. **Given** a token whose email is unverified, **When** first sign-in through a new issuer is attempted,
   **Then** no link is made and no existing identity is matched.
3. **Given** a token with no email claim, **When** first sign-in through a new issuer is attempted, **Then**
   no link is made.

### Edge Cases

- **Registration succeeds at the provider but the app fails before responding**: the account exists and can
  be signed into after verification; the app must not create a duplicate on retry.
- **The identity provider is unreachable**: registration, reset and display-name changes fail with a stated
  reason; existing sessions and all read paths continue to work.
- **Two accounts, one address**: cannot arise — the provider enforces uniqueness, and matching requires a
  *verified* address.
- **A user deletes their account while an administrator holds their record open**: deletion wins; the
  administrator's next read is refused, as `011` already specifies.
- **Sign-up abuse**: the public endpoints are rate-limited; exhaustion is a refusal, never a queue.

## Requirements *(mandatory)*

### Functional Requirements

#### Identity indirection

- **FR-AC-001**: The system shall identify every user by an **internal identifier** that it issues.
- **FR-AC-002**: The system shall not use an identity-provider subject as the key of any user-owned document.
- **FR-AC-003**: The system shall record, for each internal identifier, the set of
  `(issuer, subject)` pairs that resolve to it.
- **FR-AC-004**: When a request presents a token whose `(issuer, subject)` pair is already recorded, the
  system shall resolve it to the corresponding internal identifier.
- **FR-AC-005**: The system shall store the account's email address and display name against the internal
  identifier.
- **FR-AC-006**: The system shall migrate documents in the user-keyed stores to internal identifiers as a
  one-off task.
- **FR-AC-007**: The system shall not perform that migration on startup.
  > A startup migration that fails is invisible; the same rule `012` applied to its stage migration.

#### Linking a new provider

- **FR-AC-008**: When a token presents an unrecorded `(issuer, subject)` pair carrying a **verified** email
  that matches a stored account email, the system shall link that pair to the existing internal identifier.
- **FR-AC-009**: If the email claim is absent, or is present but not verified, then the system shall not
  match any existing identity.
  > This is the load-bearing refusal. Matching on an unverified address would let anyone who registers with
  > someone else's email inherit that person's inventory, meal plans and feedback.
- **FR-AC-010**: When a token presents an unrecorded pair that matches no stored account email, the system
  shall create a new internal identifier.
- **FR-AC-011**: The system shall record every link between a provider subject and an internal identifier
  in the administrative audit log.

#### Registration

- **FR-AC-012**: The system shall allow a person without an account to register with an email address, a
  password and a display name.
- **FR-AC-013**: When registration succeeds, the system shall request that the identity provider send a
  verification message to that address.
- **FR-AC-014**: While an account's email is unverified, the system shall refuse to establish a session for it.
- **FR-AC-015**: While an account's email is unverified, the system shall state that verification is outstanding.
- **FR-AC-016**: If an address is already registered, then the system shall refuse without disclosing
  whether that address exists.
- **FR-AC-017**: When the provider rejects a password, the system shall present the provider's stated reason.
- **FR-AC-018**: The system shall limit registration requests to **5 per minute** per source address.
- **FR-AC-044**: The system shall limit password-reset requests to **10 per minute** per source address.
  > Clarified 2026-09-03. Keyed on source address because both endpoints are reachable while signed out, so
  > there is no user to key a bucket on — unlike every existing limiter in the app. Separate buckets because
  > the abuse shapes differ: registration creates provider-side state and sends mail, while reset is an
  > email-enumeration probe. An unquantified "shall be rate-limited" is not testable, which is why the
  > numbers are named here rather than deferred to the plan.
- **FR-AC-019**: The system shall reach the identity provider through a single internal interface.
- **FR-AC-020**: The system shall not permit any other module to call the provider's administrative API directly.
  > The provider is expected to change. Confining it to one adapter makes that a replacement of one module rather than of the feature.

#### Self-service management

- **FR-AC-021**: The system shall allow a signed-in user to change their display name.
- **FR-AC-022**: When a user requests a password reset, the system shall ask the identity provider to send
  its own reset message to that address.
- **FR-AC-033**: The system shall not handle password material or password-reset tokens.
  > Clarified 2026-09-03. Completing a reset in-app would mean owning token generation, expiry, single-use
  > enforcement and replay protection — the security work the provider is there to do — and would thicken
  > the one adapter `FR-AC-019` keeps thin.
- **FR-AC-034**: When a request presents a token carrying a verified email that differs from the address
  stored for that identity, the system shall replace the stored address with it.
  > Clarified 2026-09-03. The stored email is the key `FR-AC-008` matches on when a new issuer appears, so a
  > stale value is a hijack risk, not a freshness annoyance: if the real user moves to a new address and
  > someone else later registers and verifies the old one, matching would hand them the original account.
  > Refreshing on sign-in closes that window using only what the app already receives.
- **FR-AC-035**: The system shall not treat provider-side restriction of email changes as a precondition
  for correctness.
  > The account holder's email is ALSO locked at the provider (Keycloak: declarative user profile, email
  > admin-editable only) — recorded in the deployment runbook as a manual step, alongside the
  > `post_logout_redirect_uri` registration `002` already requires. That lock is defence-in-depth: the app
  > cannot verify it is in force, it does not survive a provider change by itself, and no test can observe
  > it. `FR-AC-034` is what the app guarantees on its own terms.
- **FR-AC-023**: The system shall return an identical response to a password-reset request whether or not
  the address is registered.
- **FR-AC-024**: The system shall allow a signed-in user to export all data held about them, covering every
  store keyed to their internal identifier.
- **FR-AC-025**: The system shall allow a signed-in user to delete their own account, using the same
  two-phase erasure and recovery window as an administrator-initiated erasure.
- **FR-AC-026**: If deleting an account would leave the system with no administrator, then the system shall
  refuse the deletion.
- **FR-AC-027**: The system shall record self-service export and deletion in the administrative audit log.

#### Surface

- **FR-AC-028**: The system shall not add a primary-navigation destination for account management.
  > `002` `FR-D-017`, unchanged: the navigation is a four-item design and the account surface reaches it from
  > Home and the desktop sidebar footer.
- **FR-AC-029**: The system shall present registration and password reset to a signed-out visitor without
  requiring a failed request first.

#### Security posture

- **FR-AC-030**: The system shall hold identity-provider administrative credentials only as runtime configuration.
- **FR-AC-031**: The system shall not carry those credentials in the repository or in any image.
  > This is the app's first machine credential against the IdP — a deliberate change of posture from `002`, where the app only ever verified tokens. It follows the same rule as every other secret.
- **FR-AC-032**: The system shall request the narrowest provider privileges that registration and password
  reset require.

### Key Entities

- **Account**: the internal identity. Holds the internal identifier, email address, display name, and the
  linked `(issuer, subject)` pairs. Becomes the seventh user-keyed store, so it joins the erasure and export
  lists — see the "adding a seventh" rule in the repository guide.
- **Identity link**: one `(issuer, subject)` pair resolving to an Account. Several may exist per Account,
  which is what makes a provider change survivable.

#### Deletion reaches the provider *(clarified 2026-09-03)*

- **FR-AC-039**: When a user's account is erased, the system shall suspend the corresponding
  identity-provider account.
  > Without this, deletion is app-only: the provider knows nothing about erasure, so the user can
  > authenticate successfully, receive a brand-new valid token, and meet a `401` on every request — signed
  > in at the identity provider and comprehensively broken in the app, with nothing explaining why. Worse,
  > `002` `FR-D-010` treats `401` as its refresh-and-retry trigger, so the attempt costs a token refresh to
  > reach the same failure. Suspending fails them at the login page instead, with the provider's own
  > message.
- **FR-AC-040**: When an erased account is restored inside the recovery window, the system shall resume the
  corresponding identity-provider account.
- **FR-AC-041**: When an erasure is purged, the system shall delete the corresponding identity-provider
  account.
- **FR-AC-042**: The system shall express provider suspension, resumption and deletion in its own
  vocabulary at the adapter boundary.
  > `suspend` / `resume` / `delete`, not the provider's spelling of them — Keycloak's `enabled:false`,
  > Auth0's `blocked:true`, Okta's `lifecycle/suspend` and Entra's `accountEnabled:false` are all the same
  > intent. Keeping the provider's vocabulary inside the adapter is what `FR-AC-019` is for. These add no
  > new dependency: the adapter already needs administrative write access for `FR-AC-012`/`FR-AC-013`.
- **FR-AC-043**: While an account is erased, the system shall refuse every request authenticated as it.
  > Already true — the erasure check runs at the auth seam on every authenticated request, and the smoke
  > gate asserts it. Stated so that `FR-AC-039` is understood as defence in depth rather than the only
  > barrier: a token issued before suspension stays cryptographically valid until it expires.

#### Migration scope *(clarified 2026-09-03)*

- **FR-AC-036**: The system shall not rewrite administrative audit entries when migrating to internal
  identifiers.
  > `011` `FR-AD-022` makes the audit log append-only, and `lib/audit.ts` exports only `record` and `list`
  > precisely so no update path exists. A migration that rewrote history would have to add one.
- **FR-AC-037**: When presenting an audit entry whose recorded subject is a provider subject, the system
  shall resolve it through the identity links to the internal identifier.
- **FR-AC-038**: The system shall key erasure state by internal identifier.
  > Not cosmetic. The erasure refusal runs on every authenticated request, and after a provider link one
  > account has several `(issuer, subject)` pairs. Keyed by provider subject, an erasure recorded against
  > the old subject would not refuse a request arriving under the new one — the account would come back to
  > life on migration day. Erasure state is operational, not history, so unlike the audit log it moves.

## Out of Scope *(recorded, not addressed here)*

- **OIDC endpoint discovery.** `AuthContext` constructs the authorize / token / end-session URLs from
  `NEXT_PUBLIC_OIDC_ISSUER` *"using Keycloak's realm paths"* rather than reading
  `/.well-known/openid-configuration`. Every provider lays those paths out differently, so this is a real
  coupling — but it is client-side, independent of everything specified here, and cheap to fix on its own.
  It does not bite while Keycloak remains the provider. **Tracked as tech debt; not a prerequisite for this
  spec.** Fixing it is what would make `SC-AC-008` true for the browser as well as the server.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-AC-001**: A person can go from no account to signed in without administrator involvement.
- **SC-AC-002**: No account can hold a session before its email is verified.
- **SC-AC-003**: No existing identity is ever matched from an unverified or absent email claim.
- **SC-AC-004**: Every user-owned document resolves through an internal identifier, and none is keyed by a
  provider subject.
- **SC-AC-005**: An existing user retains all of their data when signing in through a different issuer with
  the same verified address.
- **SC-AC-006**: A user can obtain everything held about them, and remove it, without administrator
  involvement.
- **SC-AC-007**: Deleting accounts can never leave the system unadministrable.
- **SC-AC-008**: Replacing the identity provider requires changing one adapter and configuration — no change
  to controllers, models or the navigation.
