# Tasks: Administration Capabilities (`impl/nextjs`)

**Input**: Design documents from `/specs/011-admin-capabilities/` (spec.md FR-AD-001..030, plan.md AD0–AD7, research.md D1–D12, data-model.md, contracts/admin-api.md, quickstart.md)
**Tests**: INCLUDED — TDD is mandatory (constitution / `CLAUDE.md` §8); every phase starts with failing tests citing FR numbers. **AD1's tests cite `003`'s `FR-F-013`/`FR-F-016`** because that phase is a bug fix, not new behaviour (`CLAUDE.md` §11).
**Organization**: Phases map to plan phases AD0–AD7, which map to spec stories. All paths relative to repo root.

## Format: `[ID] [P?] [Story?] Description`

- **[P]**: parallelizable (different files, no dependency on an incomplete task)
- **[Story]**: US1–US7, mapping to spec.md user stories

---

## Phase 1: Setup

**Purpose**: Establish the baseline and — critically — **prove the role claim exists before building on it**. The whole feature is inert if Keycloak does not issue the claim (plan.md Risks).

- [x] T001 Run `npm run lint && npm test` at repo root; record the baseline (expect **797 unit / 76 files green, 0 lint warnings**) in `specs/011-admin-capabilities/quickstart.md` verification log
- [ ] T002 ⚠️ **BLOCKING SPIKE — STILL REQUIRED before this feature does anything in production.** *(Deferred by user decision 2026-08-01: AD0/AD1 were built **claim-agnostic** — `AUTH_ROLES_CLAIM` is configurable, default `realm_access.roles` — so a different claim layout is **config, not code**. Nothing grants admin until Keycloak actually issues the role.)* With `AUTH_MODE=oidc` against the LAN Keycloak, obtain an operator token and dump the **verified** payload; record in the quickstart log the exact claim path, the role string, and whether the app's client is in the token `aud`. If the role is absent, complete the **Manual steps** at the bottom of this file
- [x] T003 Review the seams the plan names so later tasks don't reinvent them: `authenticate()` (`packages/client/src/server/auth.ts:51-74`) and its **23** route-file callers, `resolveMode()`'s two-flag production guard (`:24-38`, the guarantee FR-AD-004 inherits), `withRoute()`'s single `AuthError`→401 branch (`route-helpers.ts:24-34`), `promoteFromFeedback()`'s `promotedBy` write (`controllers/pipeline.ts:150-158`), and the six `userId`-keyed models (data-model.md purge table) — note in the quickstart log which task consumes each

---

## Phase 2: Foundational — AD0 authorization (blocking prerequisite for every story)

**Purpose**: The `Principal` seam, roles, 403, and the admin guard. Ends with **no behaviour change** — nothing calls the guard yet.

- [x] T004 [P] Add failing `packages/client/tests/server/unit/auth-principal.test.ts`: `authenticatePrincipal()` returns `{userId, roles, isAdmin}`; `isAdmin` true only when `roles` contains `AUTH_ADMIN_ROLE` (default `admin`); roles read from `AUTH_ROLES_CLAIM` (default `realm_access.roles`) and from a **custom** dotted path when set; missing/malformed claim ⇒ `roles: []`, `isAdmin: false` (never a throw) — FR-AD-001 (D2)
- [x] T005 [P] Add failing `packages/client/tests/server/unit/auth-principal-devseam.test.ts`: in `dev` mode `X-User-Roles: admin` yields `isAdmin`; **in production** (`NODE_ENV=production`, no `AUTH_ALLOW_DEV`) `resolveMode()` throws so the header **cannot** confer admin — FR-AD-004 (D2). Assert the throw comes from the existing guard, not a new check
- [x] T006 Add `Principal` + `authenticatePrincipal()` to `packages/client/src/server/auth.ts`, and reduce `authenticate()` to `return (await authenticatePrincipal(request)).userId` — **do not change its signature**; all 23 callers stay untouched (D1). Read roles on both branches of `resolveMode()`; extract via a small dotted-path helper. T004/T005 pass
- [x] T007 [P] Add `ForbiddenError` to `packages/client/src/server/auth-errors.ts` (mirroring `AuthError`, `status = 403`)
- [x] T008 Add the `ForbiddenError` → `problemResponse(403, 'Forbidden', …)` branch to `withRoute()` in `packages/client/src/server/route-helpers.ts` — placed **before** the generic 500 catch (D3)
- [x] T009 [P] Add failing `packages/client/tests/server/unit/admin-guard.test.ts`: `requirePrincipalAdmin()` returns the principal for an admin, throws `ForbiddenError` for an authenticated non-admin, and throws `AuthError` when unauthenticated — so 401 and 403 stay distinguishable (FR-AD-003)
- [x] T010 Add `packages/client/src/server/admin-guard.ts` exporting `requirePrincipalAdmin(request): Promise<Principal>` (`import 'server-only'`). T009 passes
- [x] T011 [P] *(partial — per-route 403 refusals are asserted in `pipeline.test.ts`/`feedback.test.ts`; the enumerated table lands with the first `/admin/**` routes in AD2)* Add the **refusal-matrix harness** `packages/client/tests/server/admin-authorization.test.ts`: a table of `{path, method, invoke}` — empty for now with a guard test asserting the table is non-empty once admin routes exist — that every later phase appends to. This table is the evidence for **SC-AD-001** (D12)
- [x] T012 [P] Document `AUTH_ADMIN_ROLE` and `AUTH_ROLES_CLAIM` in `.env.example` (defaults + "optional; defaults suit Keycloak realm roles")
- [x] T013 Run `npm run lint && npm test` — green, and **no existing test changed** (proof the seam is non-breaking, D1)

**Checkpoint**: AD0 is shippable alone — new capability, zero behaviour change.

---

## Phase 3: US1 — AD1 enforce on the shipped maintainer actions 🎯 MVP

**Purpose**: Close **Defect 1** (self-approval). This is the `003` **bug fix**; tests cite `003`'s FR numbers.

- [x] T014 [P] [US1] Add failing tests in `packages/client/tests/server/feedback.test.ts`: a non-admin `POST /feedback/:id/promote` returns **403** and the record's pipeline state is unchanged — `it('refuses promotion for a non-admin (FR-AD-010 / FR-F-013)')`
- [x] T015 [P] [US1] Add failing tests in `packages/client/tests/server/pipeline.test.ts`: a non-admin `PATCH /pipeline/:id` returns **403** for `advance`, `approve-spec`, `approve-release`, `park`, `reopen`, and the stage does not move — `it('refuses stage transitions for a non-admin (FR-AD-011 / FR-F-016)')`. Include the spec's headline case: **an end user cannot reach `shipped`** (SC-AD-003)
- [x] T016 [P] [US1] Add a failing test: non-admin `GET /feedback/:id/export` returns **403** (FR-AD-013)
- [x] T017 [P] [US1] Add a failing test: promotion by an admin of **another user's** completed record records `promotedBy` = the **acting admin**, while the pipeline item's `userId` stays the **author's** so the author's own status view still resolves (FR-AD-012, data-model.md)
- [x] T018 [US1] Add `requirePrincipalAdmin()` to `packages/client/app/api/v1/feedback/[id]/promote/route.ts`, `…/feedback/[id]/export/route.ts`, and `…/pipeline/[id]/route.ts` — guard **in place**, no shape change, no relocation (D5)
- [x] T019 [US1] Change `promoteFromFeedback()` in `packages/client/src/server/controllers/pipeline.ts` to take the acting admin id and write it to `promotedBy` (`:150-158`), leaving the item's `userId` as the record author's. Drop the `{ _id, userId }` scoping on the **admin** lookup of the source record so any user's record is promotable (FR-AD-009 precursor); keep every other guard intact
- [x] T020 [US1] Record the acting administrator on gate approvals in the transition log entry (today `actor` carries only `'human' | 'session'`) — FR-AD-012
- [x] T021 [US1] *(covered per-route; folds into the table in AD2)* Append the three guarded routes to the T011 refusal matrix
- [x] T022 [P] [US1] Add a failing client test: a **403** response does **not** trigger `services/http.ts`'s FR-D-010 refresh-and-retry (only 401 does) — the regression D3 exists to prevent
### Invariants — the requirements that assert nothing *else* changed

> **Status 2026-08-01**: still open. AD0+AD1 shipped the enforcement; these four assert that *nothing else* moved and are the first tasks of the next pass.

*(Added by `/speckit.analyze`: FR-AD-002/005/006/007 are non-regression guarantees that had no explicit task. They are cheap to assert and expensive to discover broken.)*

- [x] T023a [P] [US1] Add a failing test asserting enforcement is **server-side and UI-independent** (FR-AD-002): the refusal matrix invokes handlers **directly** with a non-admin principal — never through a component — so a rendered-or-not control can never be the thing under test (SC-AD-008)
- [x] T023b [P] [US1] Add a failing test asserting an **administrator's ordinary experience is unchanged** (FR-AD-005): with an admin principal, inventory/meal-plan/grocery/own-feedback requests return exactly what the same requests return for a non-admin — admin capability is strictly additive, never a different app
- [x] T023c [P] [US1] Add a failing test asserting the system **never fails open when no administrator exists** (FR-AD-006): with zero admin-role holders, every end-user route still works **and** every admin-only route returns 403 — the "everyone is admin" default this whole spec exists to remove
- [x] T023d [P] [US1] Add a failing test asserting **end-user feedback is untouched** (FR-AD-007/008): submission, conversation, own-list, and own-delete behave exactly as before the guard, including the existing pipeline-protected delete refusal
- [x] T023 [US1] Run `npm run lint && npm test` — green

**Checkpoint**: 🎯 **Recommended first release with AD0.** The privilege hole is closed; no UI required.

---

## Phase 4: US2 + US5 — AD2 cross-user triage **with** audit

**Purpose**: Close **Defect 2**. Audit lands here, **not at its P5 spec priority**, because FR-AD-021 requires the first cross-user read to be recorded (D6).

- [x] T024 [P] [US5] Add failing `packages/client/tests/server/unit/admin-audit.test.ts`: `record()` writes admin/action/subject/time; `list()` filters by admin, subject, period; **no update or delete export exists** (FR-AD-022); and `AUDIT_TTL_DAYS (90) > ERASURE_WINDOW_DAYS (30)` asserted **from the constants** so editing either fails loudly (FR-AD-023, D6)
- [x] T025 [US5] Add `packages/client/src/server/models/admin-audit-log.ts` per data-model.md — TTL index on `at` (`90*24*3600`), compound `(subjectUserId, at)`, hot-reload-guarded like every existing model
- [x] T026 [US5] Add `packages/client/src/server/lib/audit.ts` exporting **only** `record()` and `list()`. T024 passes
- [x] T027 [P] [US2] Add failing `packages/client/tests/server/admin-feedback.test.ts`: admin `GET /api/v1/admin/feedback` lists **all** users' records attributed to authors, filterable by `status`/`stage`/`userId` (FR-AD-009); an end user's `GET /api/v1/feedback` still returns **only their own** (FR-AD-008, unchanged); non-admin gets **403**
- [x] T028 [P] [US2] Add a failing test: a record containing instruction-like text is returned as **inert data** and alters no behaviour (FR-AD-014)
- [x] T029 [US2] Add `packages/client/src/server/controllers/admin-feedback.ts` (cross-user list + read) and routes `app/api/v1/admin/feedback/route.ts`, `app/api/v1/admin/feedback/[id]/route.ts` — thin handlers per `CLAUDE.md` §7
- [x] T030 [US2] Wire `audit.record()` into every admin controller action added so far (list, read, promote, transition, export) — FR-AD-021
- [x] T031 [P] [US5] Add `app/api/v1/admin/audit/route.ts` (GET only — **no write verb**) + its controller
- [x] T032 [P] [US2] Add `packages/client/src/services/admin.ts` browser fetch wrappers (never import `src/server/*` — `CLAUDE.md` §14)
- [x] T033 [US2] Add the admin route group: `app/admin/page.tsx` + `src/views/AdminPage.tsx` + `src/components/admin/FeedbackTriageList.tsx` — triage list attributed by author, filterable
- [x] T034 [P] [US2] Add `useIsAdmin()` derived from the existing `AuthContext` token, and show the admin nav entry only when present (D11) — hiding is UX, **never** the enforcement
- [x] T035 [US2] Append the new admin routes to the refusal matrix
- [x] T036 [US2] Run `npm run lint && npm test` — green

**Checkpoint**: the feedback feature is usable in production — reports reach the maintainer, every cross-user read is audited.

---

## Phase 5: US3 — AD3 read-only support view

- [x] T037 [P] [US3] Add failing `packages/client/tests/server/admin-user-data.test.ts`: admin `GET /admin/users/:userId/data` returns that user's inventory + meal plans + grocery lists (FR-AD-015); **no write verb exists** on the path; the access is audited (FR-AD-021); a non-admin requesting another user's data gets **403** with `001` FR-036 isolation intact (FR-AD-016)
- [x] T038 [US3] Add `controllers/admin-users.ts` (read-only aggregate) + `app/api/v1/admin/users/[userId]/data/route.ts` (**GET only**)
- [x] T039 [P] [US3] Add `src/components/admin/UserDataPanel.tsx` — read-only rendering, no mutating control
- [x] T040 [US3] Append to the refusal matrix; run lint + tests

---

## Phase 6: US4 — AD4 operational visibility & control

- [x] T041 [P] [US4] Add failing `packages/client/tests/server/health-ready.test.ts`: `/api/health/ready` reports per-dependency status + overall + version; a **down** dependency ⇒ that entry unhealthy, overall not-ready, **503**, and the app still serves other routes (FR-AD-024); a **slow** dependency reports `degraded` within the bound rather than hanging (FR-AD-025)
- [x] T042 [P] [US4] Add a failing test asserting `GET /api/health` is **unchanged** — exactly `{status, version}`, no dependency fields — because `scripts/verify-rollout.sh`, the Docker healthcheck, and the smoke gate depend on it (D8)
- [x] T043 [US4] Add `src/server/lib/health-checks.ts` (bounded per-dependency probes: Mongo ping, both agent `/health`, recipe-provider config presence) + `app/api/health/ready/route.ts`. **Do not touch** `app/api/health/route.ts`
- [x] T044 [P] [US4] Add failing `packages/client/tests/server/unit/runtime-settings.test.ts`: effective value = stored override ?? **code default**; an **empty** collection reproduces today's behaviour exactly; invalid values rejected with the prior value in force (FR-AD-030, D9)
- [x] T045 [US4] Add `models/runtime-setting.ts` + `services/runtime-settings.ts` (typed key union, per-key zod, short-TTL in-process cache). T044 passes
- [x] T046 [P] [US4] Add failing tests: with `ai.enabled=false`, recommendations/parse-assist/alias-pairing/recipe-verify make **zero** model calls and return their **existing** fallbacks (not errors); an in-flight call is not aborted (FR-AD-026 + spec edge case)
- [x] T047 [US4] Add the kill-switch check at the **service** boundary (`services/meal-recommender.ts`, `parse-assist.ts`, `recipe-verifier.ts`, `alias-pairing.ts`) so every caller inherits it (D9)
- [x] T048 [P] [US4] Add `models/ai-usage-counter.ts` + an atomic `$inc` upsert at the **same** boundary as the kill switch, so a blocked call is an uncounted call (FR-AD-027, D10) — with a test asserting exactly that
- [x] T049 [P] [US4] Add `app/api/v1/admin/{settings,usage,cache,limits}` routes + controllers: settings GET/PATCH (FR-AD-026/030), usage GET (FR-AD-027), cache DELETE with optional `?userId=` (FR-AD-028), limits GET + `DELETE /limits/:key` (FR-AD-029). Rate-limit the destructive ones
- [x] T050 [US4] Add `src/components/admin/OpsPanel.tsx` (readiness, usage, kill switch toggle, cache flush, limit reset)
- [x] T051 [US4] Append to the refusal matrix; run lint + tests

---

## Phase 7: US6 — AD5 account export & two-phase erasure

- [x] T052 [P] [US6] Add failing `packages/client/tests/server/admin-accounts.test.ts` (export): the export contains data from **all six** `userId`-keyed collections (FR-AD-017, data-model.md table)
- [x] T053 [P] [US6] Add failing erasure tests: after `POST …/erase` the user is refused **at the principal seam** and disappears from every admin surface including the support view (FR-AD-018); `restore` inside the window returns everything intact (FR-AD-019); after the window `restore` returns **410 Gone**, never a silent success (FR-AD-019); erasing the **last administrator** is refused (FR-AD-020)
- [x] T054 [P] [US6] Add a failing purge test: after purge, **zero** documents keyed to that user across all six collections (FR-AD-018 "no orphans"), **and** the erasure's audit entry **survives** (FR-AD-023 margin)
- [x] T055 [US6] Add `models/account-erasure.ts` (unique `userId`, indexed `purgeAfter`) per data-model.md
- [x] T056 [US6] Enforce active-erasure refusal **inside `authenticatePrincipal()`** so no controller can forget it (D7) — one indexed lookup, cached per request
- [x] T057 [US6] Add `src/server/lib/account-purge.ts` — the six-collection table as **one tested constant** iterated once (keeps complexity ≤10), returning per-collection deleted counts
- [x] T058 [US6] Add `controllers/admin-accounts.ts` + routes `export`, `erase`, `restore`, `users/purge`; run the sweep opportunistically on accounts routes **and** on explicit trigger (no scheduler exists — D7). Rate-limit + audit every one
- [x] T059 [US6] Add `src/components/admin/AccountsPanel.tsx` with an explicit confirmation on erase (destructive, mirrors `003` FR-F-020's confirmable-delete precedent)
- [x] T060 [US6] Append to the refusal matrix; run lint + tests

---

## Phase 8: US7 — AD6 runtime-adjustable operational content

- [x] T061 [P] [US7] Add failing tests: changing approved recipe domains / popular fallbacks / the recommendations limit takes effect **without a restart**; an invalid value is rejected with the prior value in force (FR-AD-030)
- [x] T062 [US7] Route `services/recipe-verifier.ts`'s approved-domain list, `lib/popular-recipes.ts`'s fallback set, and the recommendations rate limit through `runtime-settings` **with their current hardcoded values as the code defaults** — so an empty collection is a no-op change
- [x] T063 [US7] Add `src/components/admin/SettingsPanel.tsx`; run lint + tests
      ⚠️ **This box was ticked on 2026-08-04 while the file did not exist.** It shipped in
      4.12.0 unbuilt alongside T050/T059 and was only caught on 2026-08-07 by checking the
      tree instead of the checkbox. Actually built 2026-08-07. *A ticked box is a claim,
      not evidence — verify against the tree.*

---

## Phase 9: AD7 — polish, verification, cascade

- [x] T064 [P] Add `packages/client/e2e/admin.e2e.ts`: admin triage journey (submit as user → appears in admin triage → promote → gate) **and** a non-admin seeing no admin entry and being refused on direct navigation (`CLAUDE.md` §8 per-feature rule)
- [x] T065 Confirm the refusal matrix enumerates **every** admin route × method — SC-AD-001's "100%" evidence (D12)
- [x] T066 [P] Cascade `CLAUDE.md`: §4 (new admin endpoints + `/api/health/ready`), §5 (four new collections), §6 (`AUTH_ADMIN_ROLE`, `AUTH_ROLES_CLAIM`), §7 (the 403 mapping + admin-guard handler pattern)
- [x] T067 [P] Cascade `docs/deployment.md`: the **manual** Keycloak realm-role step, the two new env vars, and the reminder that `AUTH_ALLOW_DEV` must stay absent in production
- [x] T068 Full gate: `npm run lint` (0 warnings) · `npm test` · `npm -w packages/client run test:e2e` · `bash scripts/validate-e2e.sh --no-agent`; fill the quickstart verification log
- [x] T068a Walk the quickstart end to end and tick each success criterion explicitly: **SC-AD-002** (a report reaches the maintainer in-app, zero out-of-band relay), **SC-AD-004** (purge leaves zero records), **SC-AD-005** (readiness names the down dependency, app keeps serving), **SC-AD-006** (kill switch ⇒ zero model calls, journeys still complete), **SC-AD-007** (100% of cross-user accesses audited) — the five criteria that are demonstrated rather than unit-asserted
- [x] T069 *(owed on `main` — shared file, never edited on this branch)* Update `ROADMAP_PROGRESS.md` backlog #15 + the two top lines **on `main`** (shared file — never edited on this branch)

---

## Dependencies & Execution Order

- **T002 blocks everything.** If Keycloak does not issue the role, the feature is inert — do the manual steps first.
- **Phase 2 (AD0) blocks every story.** Phases 3–8 all consume `requirePrincipalAdmin()`.
- **Phase 3 (US1) is independent of Phases 4–8** and is the MVP: ship AD0+AD1 alone.
- **Audit (T024–T026) must land before or with T029/T030** — never after a cross-user read is exposed (D6).
- **T056 (erasure refusal in the principal seam)** touches the same function as T006; sequence after Phase 2 to avoid a conflicting edit.
- `[P]` tasks within a phase touch different files and may run concurrently.

---

## Manual steps (human-only — `CLAUDE.md` §15 boundary)

These cannot be done from the repo and gate T002.

**1. Create the `admin` realm role in Keycloak**
1. Open `https://auth.fridgeplanner.lan` (Stage-1) → sign in as the Keycloak admin.
2. Select the **`fridge-planner`** realm (top-left realm selector — not `master`).
3. **Realm roles** → **Create role** → Role name: `admin` → **Save**.

**2. Assign it to the operator**
1. **Users** → select your user → **Role mapping** tab → **Assign role**.
2. Filter by **realm roles**, tick `admin` → **Assign**.

**3. Make sure the role reaches the access token**
1. **Clients** → the app's client → **Client scopes** → `<client>-dedicated` → **Add mapper** → **By configuration** → **User Realm Role**.
2. Token Claim Name `realm_access.roles`, **Add to access token: ON**, Multivalued: ON.
   *(Keycloak usually includes realm roles by default; add the mapper only if T002 shows them missing.)*
3. **Sign out and back in** — existing tokens will not contain the new role.

**4. Verify before building (this is T002)**
Decode the access token (jwt.io, or the app's dev tools) and confirm `realm_access.roles` contains `admin`. If it sits elsewhere, set `AUTH_ROLES_CLAIM` to that dotted path instead of changing code.

**5. Production env (at release, not now)**
Add `AUTH_ADMIN_ROLE=admin` to the Portainer stack env only if you use a different role name; leave both new vars unset to accept the defaults. **`AUTH_ALLOW_DEV` must remain absent** (FR-AD-004).

---

## Residual closure — 2026-08-07

Spec 011 released as `nextjs-v4.12.0` on 2026-08-04 with **68 of 69 boxes ticked** and
three of its components never written. The API was complete and enforced throughout, so
every server test passed and the smoke gate stayed green — **US4, US6 and US7 were simply
unreachable without hand-writing curl.** Nothing in the gate could see that, because
nothing in the gate drove a control.

Closed in this pass:

| Task | Was | Now |
|---|---|---|
| T023a–d | No test cited FR-AD-002/005/006/007/008 | `tests/server/admin-guard-invariants.test.ts` — 12 cases |
| T050 | `OpsPanel.tsx` absent | Built + 8 component tests + e2e |
| T059 | `AccountsPanel.tsx` absent | Built + 9 component tests + e2e |
| T063 | Ticked, file absent | Built + 5 component tests + e2e |
| T068a | Not walked | Walked; five demonstrated criteria tabled in `quickstart.md` |
| T069 | Owed on `main` | Done — PR #70, merged 2026-08-07 |

Gate: `lint` 0 warnings · **976 unit** across 92 files (94.09% lines, up from 90.19%) ·
**65 e2e** · smoke **49 pass / 0 fail**.

**T002 remains open and is the one thing that cannot be closed from the repo.** It needs an
operator token from the LAN Keycloak. Note what it does and does not block: the guard is
claim-agnostic (`AUTH_ROLES_CLAIM`, default `realm_access.roles`), so a different claim
layout is configuration, not code — but until Keycloak actually issues the role, **nobody
holds it**, and every surface built here answers 403 to everyone. End users are unaffected
(FR-AD-006, now tested).

**The lesson worth keeping:** the release gate proves the server refuses the wrong caller.
It never proved a right caller could *reach* the feature. That is why the e2e added here
drives the real controls and asserts the server's answer changed, rather than calling the
API directly — an API-only test would have passed for the entire time the feature was
unusable.
