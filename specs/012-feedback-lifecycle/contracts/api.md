# API Contracts — 012 Feedback Lifecycle

Phase 1 output. Base `http://localhost:3000/api/v1`. All errors are Problem JSON (RFC 7807).

**Two families, and the split is the point (D7 / `FR-FL-052`):**

- `/lifecycle/**` — **reporter-facing**, `authenticate()`. Own items only, projected.
- `/admin/lifecycle/**` — **maintainer-facing**, `requirePrincipalAdmin`. Cross-user, full detail.

An authenticated non-admin hitting an `/admin/**` route gets **403, deliberately not 401** — the
client treats 401 as its FR-D-010 refresh-retry trigger, so 401 would loop (`011`).

---

## Reporter surface

### `GET /lifecycle`
The caller's own items. Never another reporter's, in any stage (`FR-FL-038`, `SC-FL-003`).

```jsonc
{ "items": [ { "_id": "…", "sourceTitle": "…", "stage": "in-progress",
               "stageLabel": "Being built",          // reporter-facing language (FR-FL-035)
               "reply": { "text": "…", "at": "…" },  // if written (FR-FL-037)
               "closure": { "excerpt": "…", "releaseUrl": "…" } } ] }   // if closed (FR-FL-048)
```

### `GET /lifecycle/:id`
Own item, full reporter projection.

**Merged items are the sharp edge.** When `stage: "merged"` the response carries the **target's
stage and nothing else** (`FR-FL-019`, D14):

```jsonc
{ "_id": "…", "stage": "merged", "mergedTargetStage": "shipped" }
```

No target id, title, text, or reporter. Resolved server-side (research R5) — the target document
never leaves the process. `404` for another user's item, never `403`, so existence is not
disclosed.

---

## Maintainer surface — all `requirePrincipalAdmin`

### `GET /admin/lifecycle?stage=&priority=&userId=`
The cross-user triage queue (`FR-FL-023`), maintainer-ordered (`FR-FL-022`). Summaries; no
transition log.

### `GET /admin/lifecycle/:id`
Full item: transitions, clauses, reply, closure, artifacts.

### `PATCH /admin/lifecycle/:id`
The single action endpoint. Discriminated union, validated by Zod, applied as an **atomic guarded
`findOneAndUpdate`** so concurrent callers cannot both win (`FR-FL-004`).

| `action` | From → To | Body | Notes |
|---|---|---|---|
| `accept` | `new` → `accepted` | — | **Gate 1**. Sets source record `reviewed` (FR-FL-062) |
| `dismiss` | `new`/`accepted` → `dismissed` | `{reason}` | `no-action-required` \| `declined` (`FR-FL-016`). Also sets source record `reviewed` (FR-FL-063) — a dismissed record left at `complete` is indistinguishable from one nobody has read |
| `merge` | `new`/`accepted` → `merged` | `{targetId}` | Target must exist, must not be self |
| `advance` | `accepted`→`briefed`, `briefed`→`in-spec`, `in-progress`→`in-review` | — | `briefed`→`in-spec` **refused while any clause is pending** (`FR-FL-028`) |
| `approve-spec` | `in-spec` → `in-progress` | — | **Gate 2** |
| `reject-spec` | `in-spec` → `briefed` | `{note?}` | Returns to the clauses, never to the reporter (`FR-FL-014`) |
| `approve-release` | `in-review` → `shipped` | — | **Gate 3** |
| `close` | `shipped` → `closed` | `{excerpt, releaseTag?, releaseFallbackText?}` | Terminal (`FR-FL-049`) |
| `park` | any active → `parked` | — | Records `parkedFromStage` |
| `reopen` | `parked` → *prior* | — | Restores the exact stage |
| `set-priority` | — | `{priority}` | No stage change |
| `edit-source` | pre-`briefed` only | `{title?, problemStatement?, …}` | `FR-FL-020`; attributed (`FR-FL-021`) |
| `attach-artifact` | — | `{type, ref}` | `ref` ≤2048, **reference only, never executed** |
| `cite` | — | `{citedId}` | Reference only; moves nothing (`FR-FL-051`) |

**Refusals**: illegal / backward / gate-from-wrong-stage / concurrent → **409 `Illegal
Transition`**, state unchanged. Any transition out of a terminal → 409. Cross-user → 404.

> **No action commits, merges, tags, or deploys** (`FR-FL-057`, `SC-FL-007`). `attach-artifact`
> stores a string.

### `GET /admin/lifecycle/:id/clauses` · `PATCH …/clauses/:provisionalId` · `POST …/clauses`
Drafted clauses, each with the `derivedFrom` text **displayed beside it** (`FR-FL-025`) and an
`inferred` flag (`FR-FL-026`). `PATCH` vets one clause (`accepted` | `rejected`, optional
`editedText`). `POST` redrafts, or authors manually when drafting produced nothing usable
(`FR-FL-031`).

Rate-limited as an agent-backed call: **10/min**, key `feedback-chat:${userId}` — the existing
bucket, deliberately shared, so clause drafting cannot be used to bypass the chat limit.

### `GET /admin/lifecycle/:id/brief`
The assembled brief containing the vetted clauses (`FR-FL-032`). Markdown, `text/markdown`.
**Content a human runs — the system never executes it** (`FR-FL-033`, D3).

### `PUT /admin/lifecycle/:id/reply`
`{text}` → the maintainer reply the reporter sees, attributed (`FR-FL-036`/`FR-FL-037`).

### `GET /admin/releases`
Cached list for the closure picker (D17, `FR-FL-043`).

```jsonc
{ "releases": [ { "tag": "nextjs-v4.14.2", "name": "…", "url": "…", "publishedAt": "…" } ],
  "available": true }
```

**`available: false` is a normal response, not an error** (`FR-FL-044`/`FR-FL-045`). It carries
`unavailableReason`, and the client falls back to free text. Closure must never be gated on a
third party — so this endpoint returns **200 even when GitHub is unreachable**.

---

## Changed elsewhere

### `GET /api/health/ready`
Gains a fourth dependency (`FR-FL-047`), alongside `mongodb`, the two agents and
`recipe-providers`:

```jsonc
{ "name": "release-list", "status": "ok" | "degraded" | "not-configured" }
```

Never `down` — an unreachable release list does not make the app unready, because nothing
user-facing blocks on it.

### `/api/v1/pipeline/**` — deprecated, kept
Reads proxy to the new controller; writes refuse once the maintainer surface lands. Removed in a
follow-up once no client calls it (see plan → Migration).

### `POST /feedback/:id/promote` — superseded
Replaced by `PATCH /admin/lifecycle/:id {action:'accept'}`. Kept returning its idempotent response
during the deprecation window.

---

## Contract test checklist

One test per row, each naming its requirement in the test name:

- [ ] Reporter sees only own items — `FR-FL-038`, `SC-FL-003`
- [ ] Merged reporter sees target **stage only**, no title/text/reporter — `FR-FL-019`
- [ ] Non-admin → **403 not 401** on every `/admin/lifecycle` route — `FR-FL-055`
- [ ] Each legal transition applies; every illegal one → 409, state unchanged — `FR-FL-003`
- [ ] Concurrent transitions: exactly one applies — `FR-FL-004`
- [ ] `briefed → in-spec` refused while any clause pending — `FR-FL-028`, `SC-FL-005`
- [ ] Dismissal requires a reason; both values distinguishable — `FR-FL-016`/`FR-FL-017`
- [ ] `shipped` reachable only via recorded release approval — `SC-FL-006`
- [ ] Every transition out of `closed` refused — `FR-FL-049`
- [ ] Closure succeeds with the release list unavailable — `FR-FL-044`, `SC-FL-008`
- [ ] Erased reporter's item survives, advanceable, no identifying content — `SC-FL-010`
- [ ] No action performs a repository write — `SC-FL-007`
- [ ] Accepting sets the source record to `reviewed` — `FR-FL-062`
- [ ] **Dismissing** sets the source record to `reviewed` — `FR-FL-063`
