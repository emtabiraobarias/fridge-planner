# Quickstart: spec 013

## Local prerequisites

Keycloak must have a **service account** with `manage-users` on the realm, and its credentials in
`packages/client/.env.local`:

```
IDP_ADMIN_CLIENT_ID=fridge-planner-admin
IDP_ADMIN_CLIENT_SECRET=…
```

> This is the app's first machine credential against the IdP (`FR-AC-030`/`031`). Real values live
> in Portainer stack env in production, never in the repo — the same rule as every other secret.
> Ask the operator to create it; realm configuration is human-only (CLAUDE.md §14).

Also set, as a manual realm step: **email is admin-editable only** (declarative user profile), per
`FR-AC-035`. The app does not depend on this, but it is defence in depth and belongs in the runbook
next to the `post_logout_redirect_uri` registration `002` already requires.

## Running the migration

```bash
npm -w packages/client run migrate:account-identities -- --check   # reports, changes nothing
npm -w packages/client run migrate:account-identities              # applies
```

Idempotent, and **never on startup** (`FR-AC-007`, Constitution XII) — a startup migration that
fails is invisible.

## Verifying the journey

1. Register at `/account/register`; confirm sign-in is refused before verification (`FR-AC-014`).
2. Verify via the provider's email, sign in, reach the Kitchen.
3. Change the display name; reload; confirm it survives.
4. Export; confirm every user-keyed store appears.
5. Delete; confirm requests are refused immediately **and** that signing in again fails at the
   provider rather than landing in a broken app (`FR-AC-039` — the hole `FR-AC-043` alone leaves).
6. Restore inside the window; confirm data returns and the provider account resumes.

## Verifying provider portability

Point `AUTH_ISSUER`/`AUTH_JWKS_URI` at a second provider, sign in as an existing user with the same
verified address, and confirm the new `(issuer, subject)` pair links to the existing account and all
prior data resolves (`FR-AC-008`, `SC-AC-005`). Then confirm an **unverified** address links nothing
(`FR-AC-009`) — that refusal is what stops a stranger inheriting someone's data.
