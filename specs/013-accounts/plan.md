# Implementation Plan: Account creation & management (spec 013)

**Branch**: `013-implement` · **Spec**: `specs/013-accounts/spec.md` · **Date**: 2026-09-04

## Summary

Self-service accounts — register, manage, export, delete — built on an **internal identity** that
the app issues, so a change of OIDC provider is an adapter swap rather than a data migration.
44 requirements across 4 user stories.

The feature people asked for is US1–US3. **US4 is why this plan is large**: it forces every
user-owned document off the OIDC `sub`. That is a one-off migration touching six collections, and
it is strictly cheaper now than after more data and more collections exist.

## Technical Context

| | |
|---|---|
| **Language** | TypeScript 5, strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes` |
| **Runtime** | Next.js 15 App Router, Route Handlers as the backend, one process on :3000 |
| **Storage** | MongoDB via Mongoose 8; new `accounts` collection |
| **Identity** | OIDC via `jose`; Keycloak today, behind an adapter |
| **New dependency** | None. The provider admin API is reached with `fetch` |
| **New credential** | IdP service account, `manage-users` scope — the app's first |
| **Testing** | Vitest (node + jsdom), Playwright, `validate-e2e.sh` smoke |
| **Scale** | Household. One `accounts` document per user |

No NEEDS CLARIFICATION remain — five were resolved in the spec's clarify session, and the
technical unknowns are settled in `research.md` (R1–R8).

## Constitution Check

| Principle | Status | Note |
|---|---|---|
| III. Config in environment | ✅ | IdP credentials are runtime config, never in repo or image (`FR-AC-030`/`031`) |
| VI. Stateless processes | ✅ | Identity resolves per request, no process-local cache (R3). A cache here would let two instances disagree after an erasure — exactly what `FR-AC-043` prevents |
| XII. Admin processes one-off | ✅ | The migration is a script, explicitly not on startup (`FR-AC-007`, R5) |
| Security & Auth | ✅ | Authorization Code + PKCE unchanged; JWT verified per request; every account action audited (`FR-AC-027`) |
| Testing (NON-NEGOTIABLE) | ✅ | TDD; adapter stubbed at the module seam; Playwright for each journey (R8) |
| Coverage 80/70 | ✅ | Enforced by the existing threshold |

**No violations to justify.** One item worth stating rather than hiding: the app gains
administrative write access to the identity provider, which `002` deliberately avoided. It is
confined to one module (`FR-AC-019`), scoped to the narrowest privilege (`FR-AC-032`), and recorded
as a deliberate change of posture — not a drift.

## Project Structure

```
packages/client/
├── app/api/v1/accounts/
│   ├── register/route.ts · password-reset/route.ts
│   └── me/route.ts · me/export/route.ts
├── src/server/
│   ├── models/account.ts                    # NEW — the internal identity
│   ├── services/identity-provider.ts        # NEW — THE adapter (R4)
│   ├── controllers/accounts.ts              # NEW
│   ├── lib/account-purge.ts                 # add `account` to the delete list (seventh store)
│   └── auth.ts                              # resolve identity; refresh email; unchanged otherwise
├── src/views/AccountPage.tsx                # NEW — reached from Home/sidebar, NOT from nav
├── scripts/migrate-account-identities.mjs   # NEW — one-off, idempotent, --check
└── tests/…                                  # TDD, written first
```

## Phases

### Phase A — Identity model + migration *(foundational; blocks everything)*

`Account` model with both unique indexes; resolution in `authenticate()`; the migration script with
`--check`. **Sequenced first** because every later phase presumes `userId` is internal. Tests assert
resolution, the uniqueness guarantees, and that the migration is idempotent.

> `012` put its stage model and migration in Phase A for the same reason and it held.

### Phase B — Erasure keys move ⚠️ *(early, not late)*

`account_erasures` re-keyed to internal identifiers (`FR-AC-038`), and `account` added to
`USER_KEYED_MODELS`. **Deliberately second**: it corrects behaviour that would otherwise resurrect
deleted accounts the moment a second provider is linked, and every later phase adds more data that
erasure must reach.

### Phase C — The adapter

`identity-provider.ts` with the six operations in the app's vocabulary, plus the architecture test
proving no other module reaches the provider — modelled on `no-deploy-imports.test.ts`.

### Phase D — US1 registration

Public routes, rate limits keyed on source address, verification gating, non-disclosing conflicts.

### Phase E — US2 profile + reset

Display name; reset that the provider completes.

### Phase F — US3 export + delete

Reuses `011`'s two-phase erasure; adds provider suspend/resume/delete; last-administrator refusal.

### Phase G — US4 provider linking

Verified-email matching and its refusals. **Last**, because it is the only phase with no
user-visible value until a migration happens — but the model it needs landed in Phase A.

### Phase H — Surface + e2e

`/account` reached from Home and the sidebar footer, never from nav (`FR-AC-028`). Playwright for
each journey: an e2e that only calls the API proves the server works, never that anyone can reach
it (CLAUDE.md §8).

## Complexity Tracking

**One item.** The app acquires administrative write access to the identity provider — new for this
codebase. It is required by the decision to own the sign-up form, and mitigated by the single
adapter, the narrowest scope, and an architecture test. The alternative (provider-hosted sign-up)
was considered and rejected by the user on 2026-09-02 in favour of branded registration.

Everything else reuses machinery that exists: two-phase erasure, the rate limiter, the audit log,
the export shape, the one-off migration pattern.
