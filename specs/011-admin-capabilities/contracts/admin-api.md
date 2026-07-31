# Contract — Administration API (`impl/nextjs`)

**Branch**: `011-implement` · **Date**: 2026-08-01 · **Spec**: [`spec.md`](spec.md) · **Plan**: [`plan.md`](plan.md)

All errors are RFC 7807 Problem JSON via the existing `problemResponse()` — including the new **403**, so clients need no new parsing.

## Authorization contract (applies to every route below)

| Caller | Result |
|---|---|
| No / invalid token | **401** `Unauthorized` — unchanged behaviour (`AuthError`) |
| Valid token, **not** admin | **403** `Forbidden` — new (`ForbiddenError`, Research D3) |
| Valid token, admin | proceeds |
| Valid token, admin, but principal has an **active erasure** | **401** — refused at the principal seam before any handler runs (FR-AD-018) |

**403 is not 401 on purpose.** `services/http.ts` treats 401 as the FR-D-010 refresh-and-retry trigger; returning 401 to a non-admin would burn a refresh retrying a request that can never succeed.

Every route below writes an audit entry (FR-AD-021) with the acting administrator, action, and subject.

---

## Existing routes that gain the admin guard (no shape change)

| Method | Path | Change |
|---|---|---|
| POST | `/api/v1/feedback/:id/promote` | Admin-only (FR-AD-010). Now accepts **any user's** completed record, not just the caller's. `promotedBy` = acting admin (FR-AD-012). |
| PATCH | `/api/v1/pipeline/:id` | Admin-only (FR-AD-011). Gate actions (`approve-spec`, `approve-release`) record the approving admin. |
| GET | `/api/v1/feedback/:id/export` | Admin-only (FR-AD-013). |

Request/response shapes, status codes, and the atomic stage guard are **unchanged** — these are the `003` bug fix, not a redesign (Research D5).

## New admin routes

### Feedback triage

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/admin/feedback` | All users' records (FR-AD-009). Query: `status`, `stage`, `userId`, `page`, `limit`. Each row attributed to its author. |
| GET | `/api/v1/admin/feedback/:id` | Any user's record + transcript. Content is **inert data** (FR-AD-014). |

### Support view

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/admin/users/:userId/data` | Read-only inventory + meal plans + grocery lists (FR-AD-015). **No write verb exists on this path** — that absence is the enforcement. |

### Accounts

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/admin/users/:userId/export` | Everything held about the user, all six collections (FR-AD-017). |
| POST | `/api/v1/admin/users/:userId/erase` | Starts the two-phase erasure: immediately inaccessible, `purgeAfter = now + 30d` (FR-AD-018). **409** if already erased; **409** if this is the last administrator (FR-AD-020). |
| POST | `/api/v1/admin/users/:userId/restore` | Restores inside the window (FR-AD-019). **410 Gone** once `purgeAfter` has passed — an explicit refusal, never a silent no-op. |
| POST | `/api/v1/admin/users/purge` | Runs the sweep for all expired erasures. Also runs opportunistically on the accounts routes (Research D7 — the app has no scheduler). Rate-limited. |

### Audit, settings, usage, caches, limits

| Method | Path | Notes |
|---|---|---|
| GET | `/api/v1/admin/audit` | Filter by `adminUserId`, `subjectUserId`, `from`, `to` (FR-AD-021). **Read-only — no write/delete verb exists** (FR-AD-022). |
| GET | `/api/v1/admin/settings` | Effective values = stored override ?? code default. |
| PATCH | `/api/v1/admin/settings` | Per-key zod validation; **400** leaves the prior value in force (FR-AD-030). Includes `ai.enabled` (FR-AD-026). |
| GET | `/api/v1/admin/usage` | Per-day, per-feature model-call counts (FR-AD-027). Query: `from`, `to`. |
| DELETE | `/api/v1/admin/cache` | Flush AI caches; `?userId=` scopes it, omitted = global (FR-AD-028). |
| GET | `/api/v1/admin/limits` | Current limiter state (FR-AD-029). |
| DELETE | `/api/v1/admin/limits/:key` | Reset a limiter bucket for a user throttled in error (FR-AD-029). |

## New public route

| Method | Path | Notes |
|---|---|---|
| GET | `/api/health/ready` | **Unauthenticated**, like `/api/health`. Per-dependency status (mongo, meal agent, feedback agent, recipe providers) + overall readiness + version. Each check **bounded by a short timeout** → reports `degraded`, never hangs (FR-AD-024/025). Reports coarse status only — never connection strings, versions, or error bodies. |

`200` when ready; `503` with the same body when not, so a probe can use the status code and a human can read the detail.

## Explicitly unchanged

**`GET /api/health`** stays byte-identical: `{ status, version }`, public, **no dependency checks**. Three shipped consumers depend on it — the Docker/compose healthcheck, `scripts/verify-rollout.sh` (polls it for `version` after every release), and the smoke gate. Coupling container liveness to Mongo and two agents would let a transient agent blip trigger a restart loop, and would slow the rollout poll that exists precisely because a silent stall once went unnoticed for a day (Research D8).

Every **non-admin** route is unchanged. `001` FR-036 per-user isolation is untouched for ordinary users; cross-user access exists solely behind the admin guard (FR-AD-016), which the refusal matrix in `tests/server/admin-authorization.test.ts` proves by enumerating every admin route × method (SC-AD-001).
