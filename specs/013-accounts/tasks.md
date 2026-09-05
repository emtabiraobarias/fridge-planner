# Tasks: Account creation & management (spec 013)

**Branch**: `013-implement` · **Plan**: `specs/013-accounts/plan.md`

TDD is non-negotiable (constitution): every test task precedes the implementation it covers, and
must fail first. `[P]` marks tasks touching different files with no incomplete dependency.

> **Phase order is load-bearing.** The identity model and its migration land before any
> user-facing work, and the erasure re-key lands immediately after — not at the end. `012`
> sequenced its stage model and erasure correction the same way, and the reason holds here: every
> later phase adds data that erasure must reach, and an erasure keyed on a provider subject
> resurrects deleted accounts the moment a second provider is linked.

---

## Phase 1: Setup

- [x] T001 Add `IDP_ADMIN_CLIENT_ID` / `IDP_ADMIN_CLIENT_SECRET` to `.env.example` with a comment saying they are the app's FIRST machine credential against the IdP and must never be set in a committed file
- [x] T002 [P] Add `migrate:account-identities` script entry to `packages/client/package.json`
- [x] T003 [P] Document the two manual realm steps in `docs/deployment.md`: the `manage-users` service account, and making `email` admin-editable only (FR-AC-035) — human-only per §14, alongside the existing `post_logout_redirect_uri` step

---

## Phase 2: Foundational — identity model + migration (BLOCKS EVERYTHING)

**Phase A of the plan.** Nothing below can start until `userId` means an internal identifier.

- [x] T004 Write failing tests in `packages/client/tests/server/unit/account-model.test.ts`: the unique index on `(identities.issuer, identities.subject)` rejects a duplicate pair, and the unique index on `email` rejects a duplicate address
- [x] T005 Create `packages/client/src/server/models/account.ts` per `data-model.md` — `_id`, `email`, `displayName`, embedded `identities[{issuer,subject,linkedAt}]` as `_id:false` subdocs, both unique indexes, `timestamps: true`
- [x] T006 Write failing tests in `packages/client/tests/server/account-resolution.test.ts`: a token whose `(issuer, sub)` is recorded resolves to the internal identifier (FR-AC-004); an unrecorded pair with no email match creates a new account (FR-AC-010)
- [x] T007 Resolve identity inside `authenticate()` in `packages/client/src/server/auth.ts` — per request, NO process-local cache (research R3; a cache lets two instances disagree after an erasure)
- [x] T008 Write a failing test asserting `authenticate()` replaces a stored email when the token carries a DIFFERENT verified email (FR-AC-034), and leaves it alone when the claim is unverified
- [x] T009 Implement the conditional email refresh in `authenticate()` — compare first, write only on change (research R6)
- [x] T010 Write failing tests in `packages/client/tests/server/unit/migrate-account-identities.test.ts`: one account per distinct `sub`; running twice changes nothing the second time; `--check` writes nothing
- [x] T011 Create `packages/client/scripts/migrate-account-identities.mjs` — idempotent, `--check` mode, rewrites `userId` across `USER_KEYED_MODELS` + `lifecycle-item`, NEVER on startup (FR-AC-007, constitution XII)

**Checkpoint**: identity resolves internally; the migration is reversible-by-inspection via `--check`.

---

## Phase 3: Foundational — erasure follows the account ⚠️ (do NOT defer)

**Phase B of the plan.** Sequenced here deliberately: it corrects behaviour that would otherwise
resurrect deleted accounts, and every later phase adds more data erasure must reach.

- [x] T012 Write a failing test in `packages/client/tests/server/account-erasure-keying.test.ts`: an account erased under one `(issuer, subject)` pair is STILL refused when a request arrives under a second linked pair (FR-AC-038)
- [x] T013 Re-key `account_erasures` to the internal identifier in `packages/client/src/server/models/account-erasure.ts` and `lib/account-purge.ts`, and extend the migration (T011) to rewrite existing rows
- [x] T014 Write a failing test asserting `accounts` is in the erasure delete-list — the SEVENTH user-keyed store (CLAUDE.md §5; missing this line is how `012` deleted lifecycle items that D15 said must survive)
- [x] T015 Add `account` to `USER_KEYED_MODELS` in `packages/client/src/server/lib/account-purge.ts` and to the admin export manifest

**Checkpoint**: erasure reaches every store and survives provider linking.

---

## Phase 4: Foundational — the provider adapter

**Phase C of the plan.** Required by US1–US3; isolated so a provider change replaces one file.

- [x] T016 Write a failing architecture test in `packages/client/tests/server/unit/idp-adapter-boundary.test.ts`: no module outside `services/identity-provider.ts` references the provider's admin API — modelled on `no-deploy-imports.test.ts`
- [x] T017 Create `packages/client/src/server/services/identity-provider.ts` exporting `createUser`, `sendVerification`, `initiatePasswordReset`, `suspend`, `resume`, `deleteUser` — named in the APP's vocabulary, not the provider's (FR-AC-042)
- [x] T018 Implement the Keycloak adapter behind that interface — `enabled:false` for `suspend`, etc. — reading credentials from environment only (FR-AC-030/031)
- [x] T019 [P] Write a failing test asserting the adapter surfaces provider failure as a stated reason rather than a generic 500 (FR-AC-017), and that a provider outage never breaks read paths

**Checkpoint**: the provider is reachable through exactly one seam, proven by test.

---

## Phase 5: User Story 1 — self-registration (P1) 🎯 MVP

**Goal**: someone with no account registers, verifies, and signs in.
**Independent test**: register a new address end to end; confirm sign-in is refused before
verification; then sign in and reach the Kitchen.

- [x] T020 [P] [US1] Write failing contract tests in `packages/client/tests/server/accounts-register.test.ts`: 201 on success; 409 without disclosing existence (FR-AC-016); 400 carrying the provider's password reason (FR-AC-017); 429 past 5/min (FR-AC-018)
- [x] T021 [US1] Write a failing test in `packages/client/tests/server/accounts-register.test.ts` asserting an unverified account cannot hold a session (FR-AC-014), and that the refusal states verification is outstanding (FR-AC-015)
- [x] T022 [US1] Create `packages/client/src/server/controllers/accounts.ts` with `register` — creates the provider user, creates the `accounts` document, requests verification (FR-AC-013/014)
- [x] T023 [US1] Create `packages/client/app/api/v1/accounts/register/route.ts` — thin handler, `withRoute`, `rateLimit('register:'+ip, 5, 60_000)` (research R7)
- [x] T024 [US1] Enforce the unverified-session refusal in `packages/client/src/server/auth.ts` (FR-AC-014/015)
- [x] T025 [US1] Write a failing test in `packages/client/tests/views/AccountPage.test.tsx` asserting a SIGNED-OUT visitor can reach registration and password reset without first provoking a failed request (FR-AC-029)
  > Mirrors `002` `FR-D-013`, and it is the kind of requirement that silently does not happen: every other route in the app assumes a session, so a signed-out entry point is easy to build behind one by accident.
- [x] T026 [P] [US1] Build the registration form in `packages/client/src/components/account/RegisterForm.tsx` — email, password, display name; field-level provider errors
- [x] T027 [US1] Add `packages/client/src/views/AccountPage.tsx` and the `/account` route, reached from Home and the desktop sidebar footer — NOT a navigation destination (FR-AC-028)

**Checkpoint**: US1 is independently demonstrable.

---

## Phase 6: User Story 2 — manage your own account (P2)

**Goal**: change display name; reset password.
**Independent test**: change the display name and confirm it survives a reload and a fresh sign-in;
complete a password reset and sign in with the new password.

- [x] T028 [P] [US2] Write failing tests in `packages/client/tests/server/accounts-profile.test.ts`: display name persists (FR-AC-021); reset returns an IDENTICAL response for registered and unregistered addresses (FR-AC-023); 429 past 10/min (FR-AC-044)
- [x] T029 [US2] Add `getMe` / `updateDisplayName` / `requestPasswordReset` to `controllers/accounts.ts`
- [x] T030 [P] [US2] Create `packages/client/app/api/v1/accounts/me/route.ts` (GET, PATCH)
- [x] T031 [P] [US2] Create `packages/client/app/api/v1/accounts/password-reset/route.ts` — always 202, rate-limited
- [x] T032 [US2] Build the profile panel in `packages/client/src/components/account/ProfilePanel.tsx`
- [x] T033 [US2] Write a failing test asserting NO route accepts a password or a reset token (FR-AC-033) — the app initiates, the provider completes

---

## Phase 7: User Story 3 — export and delete your own data (P2)

**Goal**: self-service export and two-phase deletion.
**Independent test**: export and confirm every user-keyed store appears; delete, confirm access
stops immediately, restore inside the window, confirm the data returns.

- [x] T034 [P] [US3] Write failing tests in `packages/client/tests/server/accounts-selfservice.test.ts`: export covers every user-keyed store (FR-AC-024); delete is two-phase and restorable (FR-AC-025); 409 when it would leave no administrator (FR-AC-026); both are audited (FR-AC-027)
- [x] T035 [US3] Write a failing test asserting erasure SUSPENDS the provider account, restore RESUMES it, and purge DELETES it (FR-AC-039/040/041)
- [x] T036 [US3] Add `exportOwn` / `deleteOwn` to `controllers/accounts.ts`, reusing `011`'s two-phase erasure rather than a second implementation
- [x] T037 [P] [US3] Create `packages/client/app/api/v1/accounts/me/export/route.ts` and the DELETE verb on `me/route.ts`
- [x] T038 [US3] Wire provider suspend/resume/delete into the erasure, restore and purge paths
- [x] T039 [US3] Build the export + delete controls with an explicit confirmation on delete

---

## Phase 8: User Story 4 — identity survives a provider change (P3)

**Goal**: an existing user signs in through a new issuer and keeps their data.
**Independent test**: point the app at a second issuer, sign in with the same verified address,
confirm the internal identity is reused and prior data resolves.

- [x] T040 [US4] Write failing tests in `packages/client/tests/server/account-linking.test.ts`: a verified email matching a stored address links the new pair to the EXISTING account (FR-AC-008); an unverified email links NOTHING and an absent email claim links nothing (FR-AC-009); an unmatched pair creates a NEW account (FR-AC-010)
- [x] T041 [US4] Implement verified-email linking in `packages/client/src/server/auth.ts` (FR-AC-008/009/010) — the refusal is the load-bearing half: matching on an unverified address lets a stranger inherit someone's data
- [x] T042 [US4] Record every link in the audit log (FR-AC-011)
- [x] T043 [P] [US4] Write a failing test asserting an audit entry recorded against an old provider subject still resolves to the right account when displayed (FR-AC-037), and that the migration did NOT rewrite audit history (FR-AC-036)

---

## Phase 9: Polish & cross-cutting

- [ ] T044 [P] Playwright: registration → verification-blocked sign-in → verified sign-in, in `packages/client/e2e/accounts.e2e.ts`. Drive the REAL controls — an e2e that only calls the API proves the server works, never that anyone can reach it (§8)
- [ ] T045 [P] Playwright: display-name change survives reload and re-sign-in
- [ ] T046 [P] Playwright: self-delete refuses subsequent requests, and restore returns the data
- [ ] T047 Extend `scripts/smoke-test.sh` — SHARED FILE, so author it on `main` and sync down (§10) — asserting the account routes refuse an unauthenticated caller
- [ ] T048 Regenerate `docs/openapi.yaml` (`npm -w packages/client run openapi:generate`); the contract test fails otherwise, in both directions
- [ ] T049 Update CLAUDE.md §4 (new endpoints), §5 (`accounts` as the seventh store), §6 (the two new env vars) — then copy to AGENTS.md; the drift guard requires them byte-identical
- [ ] T050 Run the full gates: lint, unit, Playwright, `validate-e2e.sh --no-agent`
- [ ] T051 ⏸ Release — tag, image, pin bump — **awaiting operator approval**. Automation covers the rollout, not the decision to ship (§14). The migration (T011) must be run against prod BEFORE the pin moves

---

## Dependencies

```
Setup (T001–T003)
   └─▶ Phase 2 identity model (T004–T011)      ← BLOCKS EVERYTHING
          └─▶ Phase 3 erasure re-key (T012–T015)
                 └─▶ Phase 4 adapter (T016–T019)
                        ├─▶ US1 (T020–T027)  🎯 MVP
                        ├─▶ US2 (T028–T033)   ┐ independent of each other
                        ├─▶ US3 (T034–T039)   ┘
                        └─▶ US4 (T040–T043)  ← needs only Phase 2's model
                               └─▶ Polish (T044–T051)
```

US2, US3 and US4 do not depend on one another and can proceed in any order once Phase 4 lands.

## Parallel opportunities

- **Setup**: T002, T003 together.
- **US1**: T020 and T026 (server contract tests vs the form) together.
- **US2**: T030 and T031 (different route files) together.
- **Polish**: T044, T045, T046 are separate spec files.

## Implementation strategy

**MVP = Phases 1–5.** That delivers self-registration, which is the thing that was actually asked
for. US2/US3 follow as separate increments.

**US4 last, deliberately.** It has no user-visible value until a provider move happens — but the
model it needs already landed in Phase 2, so leaving it here costs nothing and delays no one.
