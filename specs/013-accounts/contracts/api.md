# API contracts: spec 013

All errors are RFC 7807 Problem JSON via `problem()`. Every route is a thin handler calling a
controller, per CLAUDE.md §7.

## Public (no session)

### `POST /api/v1/accounts/register`
`{ email, password, displayName }` → **201** `{ accountId }`

- **5/min per source address** (`FR-AC-018`); exceeded → **429**.
- Already registered → **409** with a message that does not confirm the address exists
  (`FR-AC-016`).
- Provider rejects the password → **400** carrying the provider's stated reason (`FR-AC-017`).
- Creates the provider user and the `accounts` document, and requests the verification message
  (`FR-AC-013`/`FR-AC-014`).

### `POST /api/v1/accounts/password-reset`
`{ email }` → **202** always

- **10/min per source address** (`FR-AC-044`).
- Response is identical whether or not the address is registered (`FR-AC-023`) — the reason it is
  `202` and not `200` with a body.
- The provider sends its own reset message and hosts the form; the app never sees a token or a
  password (`FR-AC-033`).

## Authenticated (own account)

### `GET /api/v1/accounts/me`
→ **200** `{ accountId, email, displayName, isAdmin }`

Supersedes nothing — `/api/v1/me` stays as it is; this adds the profile fields it deliberately
does not carry.

### `PATCH /api/v1/accounts/me`
`{ displayName }` → **200** `{ accountId, displayName }` (`FR-AC-021`)

### `GET /api/v1/accounts/me/export`
→ **200** JSON, every store keyed to the caller (`FR-AC-024`). Same shape as `011`'s admin export,
not a second format.

### `DELETE /api/v1/accounts/me`
→ **202** (`FR-AC-025`)

- Two-phase: immediately inaccessible, recoverable for the retention window.
- Suspends the provider account (`FR-AC-039`).
- **409** if it would leave no administrator (`FR-AC-026`).
- Audited (`FR-AC-027`).

## Not added

- No route to change email — locked at the provider, refreshed from the claim (`FR-AC-034`/`035`).
- No route completing a password reset — the provider hosts it (`FR-AC-033`).
- **No new navigation destination** (`FR-AC-028`).
