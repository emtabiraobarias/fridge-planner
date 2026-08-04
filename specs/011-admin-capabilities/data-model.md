# Data Model — Administration Capabilities (`impl/nextjs`)

**Branch**: `011-implement` · **Date**: 2026-08-01 · **Spec**: [`spec.md`](spec.md) · **Plan**: [`plan.md`](plan.md)

Four new collections, all additive. **No existing schema changes**, with one field-semantics correction noted at the end.

---

## `admin_audit_logs` (new)

```ts
{
  adminUserId: string;      // indexed — the acting administrator (never the subject)
  action: string;           // enum-constrained: 'feedback.list' | 'feedback.promote' |
                            // 'pipeline.transition' | 'feedback.export' | 'user.data.view' |
                            // 'user.export' | 'user.erase' | 'user.restore' | 'user.purge' |
                            // 'settings.update' | 'cache.flush' | 'limits.reset'
  subjectUserId?: string;   // indexed, sparse — the user whose data was read/changed
  subjectType?: string;     // 'feedback' | 'pipelineItem' | 'account' | 'setting' | 'cache' | 'limit'
  subjectId?: string;
  at: Date;                 // TTL index — see below
}
```

- **TTL index** on `at`, `expireAfterSeconds: 90 * 24 * 3600` → FR-AD-023's 90-day retention, with **no scheduler** (this codebase has none; spec `008` deliberately avoided one).
- **Append-only (FR-AD-022) is structural**: the model exports `record()` and `list()` and *nothing else*. There is no update or delete path anywhere in the application. Mongo cannot enforce this from inside the app, so the absence of a code path is the enforcement.
- Compound index `(subjectUserId, at)` for the per-subject review filter (US5 scenario 3).
- **Invariant test**: `AUDIT_TTL_DAYS (90) > ERASURE_WINDOW_DAYS (30)` asserted from the constants, so editing either number fails loudly rather than silently letting an erasure's evidence expire while that erasure is still reversible.

## `account_erasures` (new)

```ts
{
  userId: string;       // UNIQUE — one active erasure per user
  erasedAt: Date;
  purgeAfter: Date;     // indexed — erasedAt + 30 days
  restoredAt?: Date;    // set → the erasure is no longer active
}
```

- Exists because **there is no `User` model in this codebase** — a user is only a `userId` string replicated across six collections, with identity owned by Keycloak. Erasure state has nowhere else to live (Research D7).
- **Active** erasure := `restoredAt == null`. `authenticatePrincipal()` refuses any principal with an active erasure, which is what makes FR-AD-018's "immediately inaccessible to the user *and* every administrator surface" true in one place instead of in every controller.
- `purgeAfter` is indexed because the sweep's only query is `{ restoredAt: null, purgeAfter: { $lte: now } }`.

### The purge target set (FR-AD-018 "no orphans")

Purge deletes every document keyed to the user across **exactly these six** collections, then the erasure record itself. This list is a single tested constant, not six call sites:

| Collection | Key |
|---|---|
| `inventory-item` | `userId` |
| `meal-plan` | `userId` |
| `grocery-list` | `userId` |
| `ingredient-alias` | `userId` |
| `feedback-record` | `userId` |
| `pipeline-item` | `userId` |

Audit entries are **not** purged with the account — `admin_audit_logs.subjectUserId` is evidence *about* an administrative action, retained on its own 90-day TTL (FR-AD-023). The erasure test asserts the six are empty **and** that the erasure audit entry survives.

## `runtime_settings` (new)

```ts
{
  key: string;        // UNIQUE — typed union, not free-form
  value: unknown;     // shape validated per key by zod on write
  updatedAt: Date;
  updatedBy: string;  // acting administrator
}
```

- Keys (initial): `ai.enabled` (kill switch, FR-AD-026) · `recipes.approvedDomains` · `recipes.popularFallbacks` · `limits.recommendationsPerMinute` (FR-AD-030).
- **Defaults live in code**, one per key. An empty collection therefore reproduces today's behaviour exactly — which is what makes FR-AD-030's "no override ever set → behaves as today" true by construction rather than by seeding.
- Read through a short-TTL in-process cache (Research D9), consistent with the existing in-memory limiter and recommendation cache. Same single-instance caveat as those (Phase E5).

## `ai_usage_counters` (new)

```ts
{
  day: string;      // 'YYYY-MM-DD', UTC-midnight axis (same convention as rolling-grocery)
  feature: string;  // 'recommendations' | 'parse-assist' | 'alias-pairing' | 'recipe-verify' | 'feedback-agent'
  calls: number;
}
```

- Unique compound index `(day, feature)`; incremented with one atomic `$inc` upsert at each AI service boundary — the **same** boundary as the kill switch, so a blocked call is by construction an uncounted call (Research D10).
- Deliberately **counts, not cost**: FR-AD-027 asks for enough to notice an anomaly. Estimating spend would produce a number precise enough to be trusted and wrong enough to mislead.

---

## Existing-schema change: one field's semantics

`pipeline-item.promotedBy` currently records the promoted record's **own author** (`controllers/pipeline.ts:156`, where promotion is `userId`-scoped so the two are necessarily the same person). Under FR-AD-012 it records the **acting administrator**, who is now a different person from the author.

- **No migration required** — the field already exists and is already a user id string; only the value written on *future* promotions changes. Historical rows remain valid (they record the person who promoted, which under the old model was the author).
- `pipeline-item.userId` — the ownership key — is **unchanged** and remains the record author's, so the author's own status view (`003` FR-F-015) keeps working with its existing `{ userId }` scoping.
- Gate approvals gain the approving administrator's identity in the transition log entry's `actor` field, which today carries only the coarse `'human' | 'session'` label (FR-AD-012).
