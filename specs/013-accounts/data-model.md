# Data Model: Account creation & management (spec 013)

## New collection: `accounts`

```typescript
{
  _id: ObjectId,              // THE internal identifier — the value that replaces `sub` as userId
  email: string,              // lowercased; refreshed from the verified claim (FR-AC-034)
  displayName: string,
  identities: [{              // one per provider subject that resolves here (FR-AC-003)
    issuer: string,           // the token's `iss`
    subject: string,          // the token's `sub`
    linkedAt: Date,
  }],                         // _id: false subdocs
  createdAt: Date,
  updatedAt: Date,
}
```

**Indexes**

| Index | Why |
|---|---|
| `{ 'identities.issuer': 1, 'identities.subject': 1 }` **unique** | The per-request resolution path, and the database-level guarantee that one subject resolves to at most one account. Application intent is not enough — this is the same reasoning `012` used for `{userId, feedbackRecordId}`. |
| `{ email: 1 }` **unique** | `FR-AC-009` matches on it; uniqueness is what makes "matches an existing account" unambiguous. |

> **`accounts` is the seventh user-keyed store.** CLAUDE.md §5's "adding a seventh means adding a
> line there" rule applies: it must be added to `lib/account-purge.ts`'s delete list and to the
> admin export manifest, or erasure silently orphans it. This is exactly the failure `012` hit when
> lifecycle items were being deleted instead of detached.

## Changed: every user-keyed document

`userId` stops being the OIDC `sub` and becomes the `accounts._id` string. **No schema change** —
the field is already an indexed string in all six collections. Only the values change, and only
once, via the migration.

Affected (`USER_KEYED_MODELS`): `inventory-item`, `meal-plan`, `grocery-list`, `ingredient-alias`,
`feedback-record`. Plus `lifecycle-item` via `USER_DETACHED_MODELS`.

## Changed: `account_erasures`

`userId` becomes the internal identifier (**FR-AC-038**).

> Not cosmetic, and not implied by "migrate owned data only". The erasure refusal runs on every
> authenticated request, and after a provider link one account has several `(issuer, subject)`
> pairs. Keyed by provider subject, an erasure recorded against the old subject would not refuse a
> request arriving under the new one — deleted accounts would come back to life on migration day.

## Unchanged: `admin_audit_logs`

`adminUserId` / `subjectUserId` keep whatever was recorded at the time (**FR-AC-036**). The log is
append-only by construction — `lib/audit.ts` exports only `record` and `list`, deliberately with no
update path, and `011` `FR-AD-022` makes that a requirement. Rewriting history would require adding
one. Reads resolve an old subject through `identities` when displaying (**FR-AC-037**).

## State: account lifecycle

```
(none) ──register──▶ unverified ──verify──▶ active ──erase──▶ erased ──restore──▶ active
                                                                  │
                                                                  └──purge──▶ (gone)
```

- **unverified**: exists at the provider and in `accounts`; cannot hold a session (`FR-AC-016`).
- **erased**: `account_erasures` row present, provider account suspended (`FR-AC-039`). Every
  request authenticated as it is refused (`FR-AC-043`).
- **purge**: after the retention window, app data is deleted and the provider account with it
  (`FR-AC-041`).

Erasure state lives in `account_erasures`, not as a field on `accounts` — reusing `011`'s
two-phase machinery rather than building a second one.
