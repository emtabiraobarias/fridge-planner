# Data Model — 012 Feedback Lifecycle (`impl/nextjs`)

Phase 1 output. Evolves the existing `pipeline_items` collection in place (research R1).

---

## LifecycleItem

**Collection**: `pipeline_items` (unchanged — the model renames, the collection does not, so no
data move and no dual-write).

```typescript
{
  // ── identity ────────────────────────────────────────────────────────────────
  userId: string,                    // the REPORTER. indexed. cleared on erasure (R4)
  feedbackRecordId: string,          // UNIQUE with userId — enforces idempotent acceptance in the DB

  // ── immutable snapshot, taken when the item is created ──────────────────────
  sourceTitle: string,
  sourceType: 'bug' | 'improvement',
  sourceAffectedArea: string,

  // ── stage ───────────────────────────────────────────────────────────────────
  stage: 'new' | 'accepted' | 'briefed' | 'in-spec' | 'in-progress'
       | 'in-review' | 'shipped' | 'closed' | 'dismissed' | 'parked' | 'merged',
  parkedFromStage?: Stage,           // restores the exact stage on reopen
  rank?: number,                     // maintainer-set queue position (FR-FL-022)
                                     //   a ranked queue, NOT a fixed P1/P2/P3 label scale —
                                     //   the design says "ranked queue, not a flat list"

  // ── terminal detail ─────────────────────────────────────────────────────────
  dismissalReason?: 'no-action-required' | 'declined',   // FR-FL-016/017
  mergedInto?: ObjectId,             // FR-FL-018 — target item; NEVER projected to a reporter
  cites?: ObjectId[],                // FR-FL-050 — reference only, moves nothing

  // ── audit ───────────────────────────────────────────────────────────────────
  acceptedBy?: string, acceptedAt?: Date,
  transitions: [{
    from: Stage | null, to: Stage,
    actor: 'human' | 'session',
    actorUserId?: string,            // WHICH administrator (FR-FL-012)
    at: Date,
    isGateApproval: boolean,         // server-derived, never client-forgeable (FR-FL-013)
    note?: string,
  }],

  // ── content ─────────────────────────────────────────────────────────────────
  clauses: [ClauseSubdoc],           // see below
  reply?: { text: string, byUserId: string, at: Date },   // FR-FL-036/037
  closure?: ClosureSubdoc,
  artifacts: [{ type: 'draft-spec' | 'pull-request', ref: string, at: Date, note?: string }],

  // ── erasure (D15 / FR-FL-059..061) ──────────────────────────────────────────
  reporterErasedAt?: Date,           // set when the reporter's account is erased
}
```

**Indexes**: `{userId, stage}` and `{userId, updatedAt:-1}` (both carry over), plus a new
`{stage, updatedAt:-1}` for the cross-user triage queue, which is not user-scoped.

**Unique**: `{userId, feedbackRecordId}` — unchanged; this is what makes acceptance idempotent in
the database rather than in a controller.

### Stage transitions

Legality lives in **one place**, `lib/lifecycle-stages.ts`, and both the controller and the tests
read it — a matrix duplicated between code and test asserts only that someone typed it twice.

| From | To | Via | Gate |
|---|---|---|---|
| `new` | `accepted` | accept | **1** |
| `new`, `accepted` | `dismissed` | dismiss (+reason) | — |
| `new`, `accepted` | `merged` | merge (+target) | — |
| `accepted` | `briefed` | advance | — |
| `briefed` | `in-spec` | advance | — *(refused while any clause unvetted, FR-FL-028)* |
| `in-spec` | `in-progress` | approve-spec | **2** |
| `in-spec` | `briefed` | reject-spec | — *(FR-FL-014, never back to the reporter)* |
| `in-progress` | `in-review` | advance | — |
| `in-review` | `shipped` | approve-release | **3** |
| `in-review` | `in-progress` | reject-release | — *(FR-FL-064, "changes needed" — returns to the work, never to the reporter)* |
| `shipped` | `closed` | close (+closure) | — |
| any active | `parked` | park | — |
| `parked` | *`parkedFromStage`* | reopen | — |
| `closed`, `dismissed`, `merged` | — | **nothing** | — |

`closed` is terminal without exception (`FR-FL-049`, D13). A recurrence is a **new** report that
*cites* the closed one — a reference, not a transition (`FR-FL-050`/`FR-FL-051`).

### ClauseSubdoc

```typescript
{
  provisionalId: string,             // e.g. "C-03" — never a real FR- number (FR-FL-027)
  text: string,                      // one EARS clause: one trigger, one response
  derivedFrom: string,               // the record text it came from — displayed BESIDE it
  inferred: boolean,                 // true if any element is not stated in the record
  vetted: 'pending' | 'accepted' | 'rejected',
  editedText?: string,               // maintainer's replacement, if any
  vettedBy?: string, vettedAt?: Date,
}
```

`derivedFrom` is **required**, not optional. `FR-FL-025` makes vetting a *comparison*, and a
clause with nothing to compare against silently degrades into a proofread — the failure mode the
spec calls load-bearing, since well-formed EARS is easy to accept uncritically.

### ClosureSubdoc

```typescript
{
  excerpt: string,                   // maintainer-confirmed, seeded from the reporter's own words
  releaseTag?: string,               // chosen from the cached list
  releaseUrl?: string,
  releaseFallbackText?: string,      // used when the list was unavailable (FR-FL-044)
  unavailableReason?: string,        // stated to the maintainer, and recorded
  closedBy: string, closedAt: Date,
}
```

Exactly one of `releaseTag` or `releaseFallbackText` is set. The fallback is a first-class path,
not an error state — `FR-FL-045` forbids blocking closure on a third party.

---

## Changes to existing models

### FeedbackRecord — `status` transition changes owner
`003` still owns the record. `status` keeps `draft | complete | reviewed`, but `reviewed` is no
longer reached by promotion (which `012` removed). It is now set when the item is **accepted**
(`FR-FL-062`) **or dismissed** (`FR-FL-063`) — both are a maintainer having looked at it. Nothing
else about the record changes here.

### account-purge — ⚠️ behavioural change (R4)

```typescript
// delete outright
USER_KEYED_MODELS   = [inventory-item, meal-plan, grocery-list, ingredient-alias, feedback-record]
// detach, do not delete  ← NEW
USER_DETACHED_MODELS = [lifecycle-item]
```

Detaching sets `userId` to a sentinel, clears `sourceTitle` and any reporter-identifying snapshot,
and stamps `reporterErasedAt`. The item stays advanceable and closable (`FR-FL-061`).

> **CLAUDE.md §5 must change in the same PR.** It currently says "six user-keyed collections —
> adding a seventh means adding a line there, or erasure silently orphans it." There are now two
> lists with different semantics, and a future model filed under the wrong one either leaks or
> destroys data.

---

## Validation rules

| Rule | Source |
|---|---|
| Stage is one of eleven; transitions only per the matrix | FR-FL-001/003 |
| Accepting or dismissing sets the source record to `reviewed` | FR-FL-062/063 |
| Terminal stages accept no transition | FR-FL-002/049 |
| Concurrent transitions: at most one applies | FR-FL-004 |
| Dismissal requires a reason from the two-value enum | FR-FL-016 |
| Merge requires a target that is not itself | FR-FL-018 |
| `briefed → in-spec` refused while any clause is `pending` | FR-FL-028 |
| Clause ids are provisional, never `FR-` | FR-FL-027 |
| `derivedFrom` required on every clause | FR-FL-025 |
| Closure only from `shipped`; excerpt required | FR-FL-040/042 |
| Reporter reads are projections; merged → target stage only | FR-FL-019, R5 |
| A dismissed item's reason is included in the **reporter** projection | FR-FL-065 |
| `in-review` may return to `in-progress` via `reject-release` | FR-FL-064 |
| Any `complete` record is exportable regardless of stage | FR-FL-066 |
| Record deletion refused while the item is in an active stage | FR-FL-006 |
