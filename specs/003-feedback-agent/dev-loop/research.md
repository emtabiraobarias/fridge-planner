# Research — Feedback→Feature Development Loop (tracking-layer MVP, `impl/nextjs`)

Phase 0 output for the spec `003` revision (backlog #7, US4 + FR-F-013..018). All Technical Context unknowns resolved; decisions numbered for traceability from tasks. Grounded in the shipped feedback code: `src/server/models/feedback-record.ts`, `src/server/controllers/feedback.ts`, `src/server/lib/feedback-export.ts`, `src/server/types/feedback.ts`, `app/api/v1/feedback/**`, `src/context/FeedbackContext.tsx`, `src/views/FeedbackPage.tsx`, and the atomic guarded-transition precedent in `src/server/controllers/grocery-lists.ts` (spec 007 purchase lifecycle) plus the PATCH-action-union precedent in `app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route.ts` (spec 006 cook/uncook).

> **Framing.** The MVP is the **tracking layer** (spec Clarifications 2026-07-23): promote → pipeline stages → status view, with the two human gates and the branch/PR-only invariant. The app is **state + audit + gate enforcement**; the speckit chain itself is run by a Claude-orchestrated session on top of the API (Assumptions 8/9). No in-app agent runtime, no app-driven branch/PR/CI/deploy. No new npm dependency.

## D1 — Pipeline state lives in a **separate `PipelineItem` collection**, not on `FeedbackRecord`

**Decision**: Create a new Mongoose model `PipelineItem` (`src/server/models/pipeline-item.ts`) that references its source record by `feedbackRecordId` (owner-scoped), rather than extending `FeedbackRecord` with embedded pipeline fields. A **unique compound index `(userId, feedbackRecordId)`** makes idempotent promotion (FR-F-013) a database invariant. The `FeedbackRecord` schema (`models/feedback-record.ts`) is left structurally unchanged; promotion additionally sets the existing record's `status` to `reviewed` (the concrete triage action the spec's "forward-looking `reviewed` status" anticipated — Key Entities note).

**Rationale**:
- **The spec models it as a distinct entity that *references* the record** ("PipelineItem … References its source FeedbackRecord") — a separate collection is the faithful realization.
- **Two independent lifecycles.** `FeedbackRecord.status` (`draft → complete → reviewed`) is the *collection/conversation* domain; `PipelineItem.stage` (`approved → in-spec → in-review → shipped | parked`) is the *delivery* domain. Coupling them onto one document forces every conversation row to carry nullable delivery fields it will never use.
- **Idempotent promote (FR-F-013)** becomes a DB-enforced find-or-create against the unique `(userId, feedbackRecordId)` index — a second promote returns the existing item (200), never a duplicate or reset. On an embedded model you would hand-guard a nullable sub-doc.
- **Delete-protection (EC-06)** is a clean cross-collection check: `deleteFeedback` refuses while an **active** (non-`parked`) PipelineItem exists (D9). Dangling state is structurally impossible because the item references the record, not vice-versa.
- **Status-view query (FR-F-015)** is a single-collection, owner-scoped `find({ userId })` over *promoted* items only — not a sparse scan of all FeedbackRecords for "has pipeline state". A `{ userId, stage }` index serves it directly.
- **Back-compat**: every pre-revision FeedbackRecord simply has no PipelineItem — zero migration, no null fields sprinkled across existing conversation documents.

**Alternatives considered**: *Extend `FeedbackRecord` with `pipeline?: { stage, transitions[], artifacts[] }`* — rejected: over-loads the conversation document, makes idempotency/delete-protection hand-rolled, and turns the status view into a filtered scan of the whole feedback collection. *A generic `WorkflowItem` collection for any entity* — rejected as speculative generality (constitution: no over-engineering); the only promotable source today is a FeedbackRecord.

## D2 — Denormalize a minimal identity snapshot onto the PipelineItem

**Decision**: At promotion, copy an immutable identity snapshot — `sourceTitle` (= record.title), `sourceType` (= record.type), `sourceAffectedArea` (= record.affectedArea) — onto the PipelineItem, alongside `feedbackRecordId`. The status view (D8) renders from these without a per-row join back to `FeedbackRecord`.

**Rationale**: A record is `complete` and its structured fields are frozen before it can be promoted (only completed records are promotable, FR-F-013), so the snapshot can never drift. This mirrors how `MealPlan` snapshots a full `MealRecommendation` onto each entry (spec 006) — a settled precedent for denormalizing a frozen upstream shape to keep a read view single-collection. The authoritative record is still reachable by `feedbackRecordId` for the detail/export path.

**Alternatives considered**: *Lean cross-collection join at list time* — rejected: an N+1 or `$lookup` for data that is immutable at promotion; the snapshot is simpler and faster. *Store no identity, link only by id* — rejected: forces the status view to fetch every record just to show a title.

## D3 — Stage state machine: forward-only single-step, with two gated steps and terminal park/reopen

**Decision**: `STAGES = ['approved', 'in-spec', 'in-review', 'shipped']` (ordinal 0..3) plus terminal `parked`. Transitions are **single-step forward** only, except explicit park/reopen (FR-F-014):

| From | Action | To | Gate? |
|------|--------|----|-------|
| `approved` | `advance` | `in-spec` | no (draft spec produced) |
| `in-spec` | `approve-spec` | `in-review` | **yes** — spec-approval gate (FR-F-016) |
| `in-review` | `approve-release` | `shipped` | **yes** — pre-merge/pre-release gate (FR-F-016) |
| `approved` \| `in-spec` \| `in-review` | `park` | `parked` | no (terminal, idempotent) |
| `parked` | `reopen` | `parkedFromStage` (else `approved`) | no |
| any active | `attach-artifact` | *(no stage change)* | no |

`advance` is valid **only from `approved`** — the sole non-gated forward step; from `in-spec`/`in-review` it 409s ("gated transition — use `approve-spec`/`approve-release`"). This makes the two gates the *only* way past `in-spec` and into `shipped`, so `isGateApproval` is set by the endpoint from the action verb and can never be forged by the caller.

**Rationale**: The two gate boundaries in FR-F-016 are exactly "advance beyond *in-spec*" (→ `in-review`) and "reach *shipped*" (→ from `in-review`); the intermediate speckit stages (clarify/plan/tasks/analyze/implement) all run *within* `in-review` (after the spec is approved, on a branch/PR) and need no gate. Named gate actions (`approve-spec`, `approve-release`) — distinct verbs from a plain `advance` — are the literal "explicit spec-approval action" / "explicit pre-merge/pre-release approval action" the spec demands, and make the audit unambiguous. Single-step forward (no ordinal skipping) means `shipped` is structurally unreachable without a recorded `approve-release` in the transition log (SC-F-008).

**Alternatives considered**: *A generic `{action:'advance', toStage}`* — rejected: the endpoint would have to *infer* whether a gate was crossed, weakening the `isGateApproval` guarantee; named actions make the gate the caller's explicit, auditable intent. *Free backward transitions* — rejected: FR-F-014 forbids implicit backward moves; park/reopen is the only sanctioned non-forward path. *Multi-step jumps (approved→shipped)* — rejected: would bypass both gates.

## D4 — Transition API: one PATCH action-union over the pipeline item, mirroring the spec-006/007 precedent

**Decision**: The transition surface is `PATCH /api/v1/pipeline/:id` with a **Zod discriminated union on `action`** — `advance` | `approve-spec` | `approve-release` | `park` | `reopen` | `attach-artifact` — dispatched by one controller function `transitionPipelineItem(userId, id, body)`. Promotion is a record-scoped action, `POST /api/v1/feedback/:id/promote`. The status view is `GET /api/v1/pipeline` (+ `GET /api/v1/pipeline/:id` for the transition log/detail). Each mutating transition is applied with an **atomic guarded update** — `findOneAndUpdate({ _id, userId, stage: <expected-from> }, …)` — so concurrent or illegal transitions fail the guard and return 409, exactly as spec 007's `PATCH /grocery-lists/.../items/:itemId` guards `isPurchased`/`purchaseReceipt` with `$elemMatch` (`controllers/grocery-lists.ts:145-205`).

**Rationale**: A single PATCH with an action discriminator is the established local idiom for stateful lifecycle transitions — spec 006's `PATCH …/entries/:slotId` dispatches `{action:'cook'|'uncook'}`, spec 007's grocery PATCH dispatches on the purchase flags. Reusing it keeps the handler thin (parse → `authenticate` → `transitionPipelineItem` → `NextResponse.json`) and the state machine (D3) in a pure lib (D5). The guarded atomic update gives idempotency and concurrency-safety for free without a transaction. Promotion is on the feedback route tree because it is an action *on a record* (like `…/export`), and it is the one operation that reads the FeedbackRecord.

**Alternatives considered**: *Separate endpoints per action* (`/pipeline/:id/advance`, `/approve-spec`, …) — rejected: five near-identical routes vs one PATCH union; the codebase favors the action-union PATCH for lifecycles. *`attach-artifact` as a sub-resource `POST /pipeline/:id/artifacts`* — considered (matches meal-plan `/entries`, grocery `/items` append idiom) and is a reasonable alternative; folded into the PATCH union instead to keep the whole transition/annotation surface on one route, but the tasks phase MAY split it out with no contract-shape change to the artifact payload.

## D5 — The state machine is a pure lib, unit-tested without HTTP or DB

**Decision**: Extract the transition rules into a pure module `src/server/lib/pipeline-transitions.ts` — `nextStage(current, action): Stage | TransitionError`, `isGateAction(action): boolean`, `STAGE_ORDINAL`, and `assertPromotable(record)`. The controller composes it with the guarded DB write; the lib holds *only* the legality rules (D3) and is unit-tested exhaustively (every from×action cell, gate flags, park/reopen) in `tests/server/unit/pipeline-transitions.test.ts`.

**Rationale**: Mirrors the shipped pattern of pure, HTTP-free server libs (`lib/expiration.ts`, spec 009's `lib/inventory-merge.ts`) — the legality matrix is where the correctness risk concentrates (SC-F-008), so it earns exhaustive fast unit tests independent of Mongo/Next. Keeps controller cyclomatic complexity ≤10 (CLAUDE.md §7) by moving the branching into a table-driven pure function.

**Alternatives considered**: *Inline the switch in the controller* — rejected: pushes the controller over the complexity limit and couples the legality matrix to a DB round-trip in tests.

## D6 — Gate approvals, actor semantics, and the "who advances" boundary

**Decision**: Every transition appends a log entry `{ from, to, actor, at, isGateApproval, note? }`. `actor` is a semantic audit label — `'human'` or `'session'` — supplied by the caller and defaulted per action (gate actions default `'human'`; `advance`/`attach-artifact` default `'session'`). The app records the label; it does **not** treat it as an identity or a permission (single-maintainer model, Assumption 7 — both the human and the Claude-orchestrated session authenticate as the same maintainer token, FR-F-005). Promotion records `promotedBy` (= userId) + `promotedAt` and seeds the first log entry `{ from: null, to: 'approved', actor: 'human', isGateApproval: true }`.

**The boundary (Assumption 8/9)**: the **app** provides state, audit log, artifact links, the status view, and the FR-F-016/017/018 invariants — *not* a job runner. The **Claude-orchestrated session** runs the speckit chain (`/speckit.specify → … → implement`), creates the branch/PR *outside the app*, and calls the pipeline API to record progress: `advance` to `in-spec` when a draft spec exists, `attach-artifact` for the draft-spec ref and PR URL, and prompts the maintainer to perform the two gate approvals. The **maintainer** performs `approve-spec` and `approve-release` (via the UI, or by directing the session) — these are the "explicit human approval actions" of FR-F-016.

**Rationale**: Because there is no in-app agent runtime and the session runs *as* the maintainer, the app cannot (and per the assumptions need not) cryptographically separate the human from their own automation. The load-bearing guarantees are structural, not identity-based (D7/D10): the app never ships anything itself, and no transition is ever derived from feedback content. `actor` exists for the audit trail (who initiated each step), satisfying FR-F-014's "record the actor".

**Alternatives considered**: *Distinct credentials/roles for human vs session* — rejected: out of scope (Assumption 7, single-maintainer) and unenforceable without multi-identity auth the app does not have. *Omit `actor`* — rejected: FR-F-014 requires recording it.

## D7 — FR-F-017 branch/PR-only: no endpoint has a git/merge/tag/deploy side effect

**Decision**: The contract states, and a test asserts, that **no pipeline endpoint performs any git, merge, tag, release, CI, or deploy action**. `attach-artifact` stores a **URL/reference string** only. `approve-release` flips `stage` to `shipped` and records the gate approval — it does **not** merge or tag; the actual merge/tag/deploy is performed by the human *outside the app* (Portainer/git per CLAUDE.md §10/§15). `shipped` is therefore a *status assertion* ("a human-approved release happened"), backed by the recorded `approve-release` gate entry — never a side effect the app took.

**Rationale**: This is the cleanest way to make FR-F-017 unfalsifiable at the code level: the pipeline controller imports no `child_process`/git/exec/deploy client (an architecture test greps for their absence, SC-F-008). Even a buggy or manipulated advance can, at worst, mislabel a stage — it can never cause an unattended merge/release because that capability does not exist in the app.

**Alternatives considered**: *Have `approve-release` call a deploy webhook* — rejected outright: violates FR-F-017 and CLAUDE.md §15 (deploys are human-gated through Portainer). *Store artifacts as opaque blobs* — rejected: they are references (links), not content the app executes.

## D8 — Status view: a new list endpoint + a `PipelineStatusView` on the Feedback page

**Decision**: `GET /api/v1/pipeline` returns the maintainer's PipelineItems (owner-scoped, optional `?stage=` filter, sorted by `updatedAt` desc) with `stage`, the denormalized `sourceTitle`/`sourceType`, and `artifacts` (draft-spec ref + PR URL). Client-side: a new `PipelineContext` (`src/context/PipelineContext.tsx`) holds the list + `promote`/`transition` actions and a browser service `src/services/pipeline.ts`; a `PipelineStatusView` component renders items grouped/badged by stage with artifact links; a `PromoteButton` on the completed-record surfaces (`CompletionCard`, `FeedbackHistory`) calls promote. `PipelineProvider` mounts on the feedback surface.

**Rationale**: Constitution mandates Context + hooks (no store); a *dedicated* `PipelineContext` keeps `FeedbackContext` focused on chat+review (SRP) while the two share the Feedback page. The status view is its own read model (D1), so a dedicated list endpoint + context is the natural shape and keeps the promote/transition actions co-located with the list they refresh. Reuses the existing `services/http.ts` (`apiFetch`/`ensureOk`) fetch wrappers and the `problem()`/`withRoute` handler stack — no new infrastructure.

**Alternatives considered**: *Extend `FeedbackContext` with pipeline state* — rejected: bloats the chat context with an unrelated concern. *A separate `/pipeline` route/page* — deferred: the spec frames the status view as part of the Feedback surface; a dedicated page is a later increment, not MVP.

## D9 — Delete-protection (EC-06): active pipeline blocks deletion; parked cascades

**Decision**: `deleteFeedback` (`controllers/feedback.ts:147`) first checks for a PipelineItem on the record. If an **active** (non-`parked`) item exists → **409** ("This record is in the active development pipeline. Park it first."). If **no** item, or only a **`parked`** (terminal) one, deletion proceeds and cascades — the parked PipelineItem is deleted in the same operation so no pipeline state dangles against a missing record (EC-06).

**Rationale**: The spec offers two acceptable readings ("protected from deletion, *or* deletion also removes it … pipeline state is never left dangling"); this combines the safe halves — never silently destroy in-flight work (block active), never leave orphaned state (cascade parked). The check is a cheap owner-scoped `findOne` before the existing `findOneAndDelete`.

**Alternatives considered**: *Always block if any PipelineItem exists* — rejected: a parked item is a dead end that should not permanently pin the record. *Always cascade* — rejected: silently deleting a record mid-pipeline loses auditable in-flight state.

## D10 — Injection-resistance (FR-F-018): transitions are explicit maintainer actions, never derived from content

**Decision**: The single load-bearing invariant — **a stage transition is produced *only* by an explicit, authenticated maintainer API call** (`promote`, or a `PATCH` action). **No** code path reads `FeedbackRecord.transcript` or its structured fields and triggers a transition, a merge, a tag, or a deploy. The record→spec handoff (D11) is the FR-F-007 export *text*, which is DATA a human reviews in `/speckit.specify` — never an instruction the app acts on. This extends the existing FR-F-011 untrusted-data posture across the whole pipeline.

**Rationale**: Injection resistance is achieved by *construction*, not by scanning content for bad strings: since the only transition triggers are explicit action verbs on authenticated endpoints, instruction-like text ("merge this", "deploy now") in a record is inert — it can, at worst, seed a draft spec a human then rejects (Assumption 10). Directly testable (FR-F-018 / spec EC "manipulated content"): promote and advance a record whose fields embed commands, and assert stage changes only via explicit actions and never reaches `shipped` without a recorded `approve-release`.

**Alternatives considered**: *Scan record content for dangerous instructions* — rejected: brittle denylist; the structural "no content-derived transition" invariant is stronger and simpler. *Trust the session to self-limit* — rejected: the guarantee must hold at the contract level regardless of caller behavior.

## D11 — The record→draft-spec handoff reuses `feedback-export.ts`; nothing auto-writes a spec file

**Decision**: The seed for `/speckit.specify` is the **existing** `renderFeedbackMarkdown` output (`lib/feedback-export.ts`, FR-F-007) — reused verbatim, no new rendering. The flow: promote → the session/human calls `GET /feedback/:id/export` → pastes the spec-shaped markdown into the normal spec-first workflow on `main` → a real `spec.md` is authored there. The resulting **draft-spec reference** (a spec-dir path, PR, or commit URL — a string) is recorded on the PipelineItem via `attach-artifact {type:'draft-spec', ref}`. **No app code writes to `specs/`** or creates a spec file (Assumption 9); `in-spec` means "a draft spec now exists for this item", pointed to by its draft-spec artifact.

**Rationale**: The export lib already produces template-aligned markdown (SC-F-003) — reusing it is the constitution's reuse mandate and keeps the handoff a human-reviewed draft (FR-F-018, Assumption 2). Storing only a *reference* keeps the app out of the spec-authoring business (spec-first on `main`, CLAUDE.md §11) and out of any filesystem/git side effect (FR-F-017, D7).

**Alternatives considered**: *App generates and commits a spec file on promote* — rejected: violates Assumption 9 and FR-F-017 (a git side effect), and would make manipulated content an authority rather than a draft. *A new spec-seed renderer* — rejected: `feedback-export.ts` already does exactly this.

## D12 — Rate-limit tier and artifact shape

**Decision**: Promotion and all pipeline transitions/reads use the **default tier (100/min)** — they are maintainer actions, not assistant-backed (FR-F-009 puts only agent chat at 10/min). Keyed per user (`pipeline:${userId}`, `promote:${userId}`) via `rateLimit(key, 100, 60_000)`. **Artifacts** are an append-only array of typed links `{ type: 'draft-spec' | 'pull-request', ref: string, at: Date, note?: string }`; the status view surfaces the latest of each type.

**Rationale**: Consistent with the existing rate-limit map (only the LLM-backed feedback-chat turn is throttled to 10/min; list/detail/export/delete are default). A typed link array is extensible (multiple PRs), audit-friendly (records *when* each materialized, FR-F-015 "as they come into existence"), and avoids re-modeling for a future third artifact type.

**Alternatives considered**: *Two fixed fields `draftSpecRef`/`prUrl`* — simpler but not extensible and loses the materialization timestamp; rejected. *A stricter transition rate limit* — unjustified; these are low-frequency human actions.
