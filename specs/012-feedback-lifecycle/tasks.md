# Tasks: Feedback Lifecycle — triage to closure (`impl/nextjs`)

**Input**: [`spec.md`](spec.md) (shared) + [`plan.md`](plan.md) · [`research.md`](research.md) · [`data-model.md`](data-model.md) · [`contracts/api.md`](contracts/api.md)
**Tests**: included — TDD is NON-NEGOTIABLE per `constitution.md`. Write the failing test first, and **name the requirement in the test name** (`it('refuses advance while a clause is unvetted (FR-FL-028)', …)`).
**Format**: `[ID] [P?] [Story] Description` — `[P]` = parallelizable (different files, no incomplete dependency)
**Stories**: US1 triage (P1) · US2 reporter visibility (P2) · US3 clause vetting (P3) · US4 gates (P4) · US5 closure (P5) · US6 duplicates (P6) · US7 erased accounts (P7)

> **Per-branch file.** Never exists on `main`. All paths are relative to the repo root.
>
> **Playwright is not a follow-up.** Every story phase ends with its e2e task. A story is not done
> without it (CLAUDE.md §8). And per that same rule: **drive the real controls, not
> `page.request`** — an e2e that only calls the API proves the server works, never that anyone can
> reach it. Spec 011 shipped three panels unbuilt with every server test green.

---

## Phase 1: Setup

- [X] T001 [P] Add `GITHUB_REPO` (format `owner/name`, no credential) to `.env.example`, `docker-compose.yml`, `docker-compose.prod.yml` and `deploy/prod.env.example`
- [X] T002 [P] Add the `migrate:lifecycle-stages` script entry to `packages/client/package.json`
- [X] T003 [P] Document `GITHUB_REPO` in `CLAUDE.md` §6 env table and `docs/DEVELOPMENT.md`

---

## Phase 2: Foundational ⚠️ **blocks every user story**

Plan phases A + B. The stage graph is the single source of truth every story reads, and the
erasure correction lands here — **not** in US7 — because it fixes shipped behaviour that destroys
data, and every story below adds more of that data.

- [X] T004 [P] **(RED)** Stage-graph legality matrix in `packages/client/tests/server/unit/lifecycle-stages.test.ts`: all 11 stages; every legal transition per data-model; every illegal one refused; `closed`/`dismissed`/`merged` accept nothing (FR-FL-001/002/003/049). Build the matrix **at module scope** — `it.each` expands at collection time, so a table built in `beforeAll` registers zero cases
- [X] T005 **(GREEN)** `packages/client/src/server/lib/lifecycle-stages.ts` — stages, legal-transition map, gate flags, terminal set, `parkedFromStage` restore. Controllers and tests both read this; a matrix duplicated in the test only proves someone typed it twice
- [X] T006 [P] **(RED)** Model tests in `packages/client/tests/server/unit/lifecycle-item-model.test.ts`: widened stage enum, `clauses`/`reply`/`closure`/`dismissalReason`/`mergedInto`/`cites`/`priority`/`reporterErasedAt`, `{userId,feedbackRecordId}` unique, new `{stage,updatedAt:-1}` index
- [X] T007 **(GREEN)** Rename `packages/client/src/server/models/pipeline-item.ts` → `lifecycle-item.ts` (same collection `pipeline_items`, research R1); widen enum, add fields and index. Keep the `mongoose.models` hot-reload guard — schema edits need a dev-server restart
- [X] T008 Migration `packages/client/scripts/migrate-lifecycle-stages.ts` mapping `approved → accepted`, idempotent, run as a one-off admin task — **never on startup**, where a failure is invisible
- [X] T009 [P] **(RED)** Purge tests in `packages/client/tests/server/unit/account-purge.test.ts`: the five delete-list models are deleted; the lifecycle item **survives**, loses reporter-identifying content, and gains `reporterErasedAt` (FR-FL-059/060)
- [X] T010 **(GREEN)** Split `packages/client/src/server/lib/account-purge.ts` into `USER_KEYED_MODELS` (delete) and `USER_DETACHED_MODELS` (detach). ⚠️ Erasure currently **deletes** lifecycle items, directly contradicting D15 (research R4)
- [X] T011 Update `CLAUDE.md` §5 — the "six user-keyed collections, adding a seventh means adding a line there" rule now covers **two lists with different semantics**; a future model filed under the wrong one either leaks or destroys data
- [X] T012 Extend `packages/client/src/server/lib/audit.ts` usage so every lifecycle transition records actor + time (FR-FL-005) via the existing append-only `record()` — **done with T014**, as planned. Added `lifecycle.transition`/`edit`/`rank` to `ADMIN_AUDIT_ACTIONS` and a `lifecycle` subject type; `pipeline.transition` is kept because the trail is append-only and historic entries cannot be relabelled

**Checkpoint**: ✅ stage graph green (158 assertions), model migrated, erasure no longer destroys lifecycle work. T012 rides with T014.

---

## Phase 3: US1 — Maintainer triages an incoming report (P1) 🎯 MVP

**Goal**: a report can be accepted or dismissed, and the decision is recorded rather than implied by silence.
**Independent test**: submit as one user; as maintainer accept it and see `accepted`; dismiss another and see `dismissed` with a reason.

- [X] T013 [P] [US1] **(RED)** Contract tests in `packages/client/tests/server/lifecycle-triage.test.ts`: accept `new→accepted` (FR-FL-008); dismiss with each reason, stored distinguishably (FR-FL-016/017); illegal transition → 409 unchanged (FR-FL-003); concurrent transitions → exactly one applies (FR-FL-004); non-admin → **403 not 401** (FR-FL-055). Reset the limiter key in `beforeEach` — it is module-level state surviving between tests
- [X] T014 [US1] **(GREEN)** `packages/client/src/server/controllers/lifecycle.ts` — atomic guarded `findOneAndUpdate` per action, `problem()` refusals, `isGateApproval` derived server-side (FR-FL-013)
- [X] T015 [US1] Create a lifecycle item at stage `new` when a record reaches `complete` (research R2), in `packages/client/src/server/controllers/feedback.ts`
- [X] T016 [P] [US1] **(RED)** Queue tests in `packages/client/tests/server/admin-lifecycle.test.ts`: cross-user listing (FR-FL-023), `?stage=` filter, **rank ordering** (FR-FL-022 — a ranked queue, not a P1/P2/P3 label scale)
- [X] T017 [US1] **(GREEN)** `packages/client/src/server/controllers/admin-lifecycle.ts` — cross-user queue, summaries without the transition log
- [X] T018 [US1] Route handlers `packages/client/app/api/v1/admin/lifecycle/route.ts` (GET queue) and `[id]/route.ts` (GET full · PATCH action union), both `requirePrincipalAdmin` + `withRoute` + `connectDb`
- [X] T019 [US1] `edit-source` and `set-rank` actions in the controller — edits allowed pre-`briefed` only, attributed to the maintainer (FR-FL-020/021); `set-rank` positions the item in the queue (FR-FL-022)
- [X] T020 [US1] Refuse deletion of a feedback record whose item is in an active stage (FR-FL-006) in `packages/client/src/server/controllers/feedback.ts`
- [X] T021 [P] [US1] `packages/client/src/services/lifecycle.ts` — browser fetchers via `apiFetch`/`ensureOk`
- [X] T022 [US1] **(RED→GREEN)** `packages/client/tests/components/admin/TriageQueue.test.tsx` + `packages/client/src/components/admin/TriageQueue.tsx` — queue, accept, dismiss-with-reason, priority
- [X] T023 [US1] Add the triage tab to `packages/client/src/views/AdminPage.tsx` (research R6)
- [X] T024 [US1] **Playwright** `packages/client/e2e/lifecycle.e2e.ts` — accept and dismiss journeys **driven through the UI**, asserting the server's answer changed
- [X] T073 [US1] **(RED→GREEN)** Source-record status side effect in `packages/client/tests/server/lifecycle-triage.test.ts` + `packages/client/src/server/controllers/lifecycle.ts`: accepting sets the record to `reviewed` (FR-FL-062) and **dismissing does too** (FR-FL-063). Added by analyze finding C1 — the transition was asserted in the API contract with no requirement and no task behind it, because `003` reached `reviewed` "on first promotion" and `012` removed promotion. A dismissed record left at `complete` is indistinguishable from one nobody has read

**Checkpoint**: ✅ US1 independently shippable — MVP complete. 97 test files / 1191 tests, lint clean.

---

## Phase 4: US2 — The reporter learns what happened (P2)

**Goal**: a reporter sees where each of their reports stands, plus any maintainer reply.
**Independent test**: submit as reporter; advance and reply as maintainer; see the new stage and reply, and no other reporter's report anywhere.

- [X] T025 [P] [US2] **(RED)** `packages/client/tests/server/lifecycle-reporter.test.ts`: own items only (FR-FL-038); another user's id → **404 not 403**, so existence is not disclosed; reporter-facing stage labels (FR-FL-035); zero cross-user visibility (SC-FL-003)
- [X] T026 [US2] **(GREEN)** Reporter projection in `packages/client/src/server/controllers/lifecycle.ts` — a projection, never a client-side filter (research R5)
- [X] T027 [US2] Route handlers `packages/client/app/api/v1/lifecycle/route.ts` and `[id]/route.ts` — `authenticate()` only, no admin guard
- [X] T028 [P] [US2] **(RED)** Reply tests in `packages/client/tests/server/lifecycle-reply.test.ts`: maintainer writes; reporter sees it attributed (FR-FL-036/037); non-admin cannot write
- [X] T029 [US2] **(GREEN)** `PUT /admin/lifecycle/:id/reply` handler + controller support
- [X] T030 [US2] Reporter-facing stage vocabulary in `packages/client/src/lib/lifecycle-labels.ts` — "Being specified" vs "Being built" is the distinction D12 buys the reporter (FR-FL-035)
- [X] T031 [US2] **(RED→GREEN)** Make `packages/client/src/components/feedback/PipelineStatusView.tsx` **read-only** for reporters and point it at `/lifecycle`; transition controls live only on the maintainer surface (FR-FL-053, research R6)
- [X] T074 [US2] **(RED→GREEN)** Dismissal reason in the reporter projection — `packages/client/tests/server/lifecycle-reporter.test.ts` + `packages/client/src/server/controllers/lifecycle.ts`: a dismissed reporter sees the **reason**, not just the stage (FR-FL-065). Found by validating against the design artifact, which labels that exit "reason sent to reporter" — for declined work the reason **is** the closing of the loop, and a reporter seeing only `dismissed` learns nothing
- [X] T032 [US2] **Playwright** extend `packages/client/e2e/lifecycle.e2e.ts` — reporter sees stage + reply, the **dismissal reason** when dismissed, and **cannot see another reporter's report**

**Checkpoint**: ✅ the loop returns something to the reporter — D1's premise is met. T032 (Playwright) pending a build.

---

## Phase 5: US3 — Requirements drafted and vetted before work starts (P3)

**Goal**: EARS clauses drafted at `briefed`, vetted clause-by-clause against the reporter's words; nothing proceeds unvetted.
**Independent test**: move an accepted item to `briefed`, see clauses each beside their source text, accept some and reject others, confirm `in-spec` is refused while any is pending.

- [X] T033 [P] [US3] Add the clause-drafting mode to `agents/feedback-collector/instructions/system-prompt.md` — returns `{status:'clauses', clauses:[{text, derivedFrom, inferred}]}`, one trigger and one response per clause, **derive only, never invent** (FR-FL-026/030)
- [X] T034 [P] [US3] Add a `ClauseDraftQuality` eval + test cases to `agents/feedback-collector/agent.yaml`
- [X] T035 [US3] **(RED)** `packages/client/tests/server/unit/feedback-collector-clauses.test.ts` — third member of the Zod discriminated union parses; fence-stripped and prose-wrapped JSON salvaged; malformed → throws
- [X] T036 [US3] **(GREEN)** Extend `packages/client/src/server/services/feedback-collector.ts` with the clause mode (research R3). Must **fail soft** when the agent predates the mode — FR-FL-031 already makes "no clauses drafted" a first-class path
- [X] T037 [P] [US3] **(RED)** `packages/client/tests/server/lifecycle-clauses.test.ts`: drafting on entering `briefed` (FR-FL-024); `derivedFrom` required (FR-FL-025); `inferred` marked (FR-FL-026); provisional ids, never `FR-` (FR-FL-027); **`briefed→in-spec` refused while any clause pending** (FR-FL-028, SC-FL-005); per-clause accept/edit/reject (FR-FL-029); manual authoring when drafting yields nothing (FR-FL-031); rate-limited on the shared `feedback-chat:${userId}` bucket
- [X] T038 [US3] **(GREEN)** Clause storage + vetting in `packages/client/src/server/controllers/lifecycle.ts`
- [X] T039 [US3] Route handlers `packages/client/app/api/v1/admin/lifecycle/[id]/clauses/route.ts` and `clauses/[provisionalId]/route.ts`
- [X] T040 [US3] Extend `packages/client/src/server/lib/feedback-export.ts` so the brief carries the vetted clauses (FR-FL-032), and `[id]/brief/route.ts` serving `text/markdown` — **content a human runs; the system never executes it** (FR-FL-033)
- [X] T041 [US3] **(RED→GREEN)** `packages/client/tests/components/admin/ClauseVetting.test.tsx` + `packages/client/src/components/admin/ClauseVetting.tsx` — each clause rendered **beside its `derivedFrom` text**. Vetting is a comparison, not a proofread: well-formed EARS is easy to accept uncritically, and a model can produce beautifully-shaped clauses that are subtly wrong
- [X] T076 [US3] **(RED→GREEN)** Export any `complete` record regardless of stage — `packages/client/tests/server/lifecycle-export.test.ts` + `packages/client/app/api/v1/admin/lifecycle/[id]/export/route.ts`: a completed record is exportable **before** reaching `briefed` (FR-FL-066), reusing `lib/feedback-export.ts`. Brief assembly (T040) is the richer artifact built on top, not a replacement. Found by validating against the design artifact: a thin forced-finalize record is "still exportable, promotable and complete"
- [X] T042 [US3] **Playwright** extend `packages/client/e2e/lifecycle.e2e.ts` — vet clauses through the UI; assert advance is **blocked** until the last one is vetted

**Checkpoint**: ✅ `briefed` is a real stage doing real work (D11/D20). Agent mode is written and unit-tested against a stub; it cannot be verified live until the OpenAI account has credit.

---

## Phase 6: US4 — The maintainer moves work through the gates (P4)

**Goal**: gates 2 and 3, park/reopen, and gate-2 rejection returning to the clauses.
**Independent test**: walk an item `briefed → shipped`, confirming each gate needs an explicit approval and no transition touches the repository.

- [X] T043 [P] [US4] **(RED)** `packages/client/tests/server/lifecycle-gates.test.ts`: `approve-spec` `in-spec→in-progress` (FR-FL-009); `approve-release` `in-review→shipped` (FR-FL-010); each records **which** administrator (FR-FL-012); gate from the wrong stage → 409 (FR-FL-015); `reject-spec` returns to `briefed` with clauses intact, **never to the reporter** (FR-FL-014); park stores `parkedFromStage`, reopen restores it; `shipped` unreachable without a recorded release approval (SC-FL-006)
- [X] T044 [US4] **(GREEN)** Gate actions, park/reopen and reject-spec in `packages/client/src/server/controllers/lifecycle.ts`
- [X] T045 [P] [US4] **(RED)** `packages/client/tests/server/unit/lifecycle-invariants.test.ts` — **no action performs any repository write** (SC-FL-007, FR-FL-057); `attach-artifact` stores a string and never dereferences it; report text never reaches an agent as instruction (FR-FL-058); **no lifecycle action emits a notification outside the application** (FR-FL-039 — a negative requirement, so it needs an explicit assertion or nothing ever checks it); every maintainer capability refuses a non-admin at the server regardless of surface (FR-FL-054, SC-FL-009)
- [X] T046 [US4] **(RED→GREEN)** `packages/client/tests/components/admin/DeliveryPanel.test.tsx` + `packages/client/src/components/admin/DeliveryPanel.tsx` — stage, transition controls, artifacts
- [X] T047 [US4] Add the delivery tab to `packages/client/src/views/AdminPage.tsx`, completing D7's combined triage-and-delivery surface (FR-FL-056)
- [X] T075 [US4] **(RED→GREEN)** `reject-release` action — `packages/client/tests/server/lifecycle-gates.test.ts` + `packages/client/src/server/lib/lifecycle-stages.ts` + `controllers/lifecycle.ts`: `in-review → in-progress` with an optional note (FR-FL-064). Found by validating against the design artifact, whose spine shows an edge from gate 3 back to `in-progress` labelled "changes needed" — without it, review finding a problem had nowhere to send the work. Mirrors `reject-spec` at gate 2 and, like it, returns to the work rather than to the reporter
- [X] T048 [US4] **Playwright** extend `packages/client/e2e/lifecycle.e2e.ts` — full gate walk through the UI to `shipped`, **including a gate-3 rejection round trip**

---

## Phase 7: US5 — The maintainer closes the loop (P5)

**Goal**: closure with a pre-filled excerpt and a picked release; never blocked by GitHub.
**Independent test**: close a `shipped` item; the reporter sees excerpt + release; closure still succeeds with the release list unavailable.

- [X] T049 [P] [US5] **(RED)** `packages/client/tests/server/unit/release-list.test.ts` (stub `global.fetch`): parse; 1h cache hit avoids a second call; failure → `available:false` **with a reason, not a throw**
- [X] T050 [US5] **(GREEN)** `packages/client/src/server/services/release-list.ts` — unauthenticated read, module-level cache, degrade-never-block (research R7)
- [X] T051 [US5] `packages/client/app/api/v1/admin/releases/route.ts` — returns **200 even when GitHub is unreachable**; `available:false` is a normal response, not an error (FR-FL-044/045)
- [X] T052 [P] [US5] Add the `release-list` probe to `packages/client/src/server/lib/health-checks.ts` — reports `degraded`, **never `down`** (FR-FL-047); nothing user-facing blocks on it
- [X] T053 [P] [US5] **(RED)** `packages/client/tests/server/lifecycle-closure.test.ts`: closure only from `shipped` (FR-FL-040); excerpt pre-filled from the reporter's own title + problem statement (FR-FL-041); excerpt required (FR-FL-042); fallback free text when unavailable, with the reason recorded (FR-FL-044, SC-FL-008); every transition out of `closed` refused (FR-FL-049); `cite` is reference-only and moves nothing (FR-FL-050/051)
- [X] T054 [US5] **(GREEN)** `close` and `cite` actions + `ClosureRecord` persistence in `packages/client/src/server/controllers/lifecycle.ts`
- [X] T055 [US5] **(RED→GREEN)** `packages/client/tests/components/admin/ClosureComposer.test.tsx` + `packages/client/src/components/admin/ClosureComposer.tsx` — pre-filled excerpt, release picker, and the free-text fallback **stating why** the list was unavailable
- [X] T056 [US5] Show excerpt + release to the reporter (FR-FL-048) in `packages/client/src/components/feedback/PipelineStatusView.tsx`
- [X] T057 [US5] **Playwright** extend `packages/client/e2e/lifecycle.e2e.ts` — close through the UI **with the release endpoint mocked as unavailable**, asserting closure still succeeds

**Checkpoint**: ✅ the lifecycle can reach its terminal stage. Primary journey complete end to end.

---

## Phase 8: US6 — Duplicates collapse without leaking (P6)

**Goal**: merge a duplicate; its reporter still learns something, without seeing anyone else's report.
**Independent test**: merge one reporter's report into another's; as the first reporter, see a status and nothing more.

- [X] T058 [P] [US6] **(RED)** `packages/client/tests/server/lifecycle-merge.test.ts`: merge → terminal `merged` with target recorded (FR-FL-018); merged reporter sees **target stage only** — no title, text or reporter id in the response body (FR-FL-019, SC-FL-003); self-merge refused; any further transition refused
- [X] T059 [US6] **(GREEN)** `merge` action + the status-only resolution in `packages/client/src/server/controllers/lifecycle.ts` — resolved server-side so the target document never leaves the process (research R5)
- [X] T060 [US6] Merge control in `packages/client/src/components/admin/TriageQueue.tsx`
- [X] T061 [US6] **Playwright** extend `packages/client/e2e/lifecycle.e2e.ts` — as the merged reporter, assert the target's **title is absent from the page**, not merely hidden

---

## Phase 9: US7 — Work survives an erased account (P7)

**Goal**: the behaviour Phase 2 made possible, verified as a user story.
**Independent test**: erase a reporter mid-flight; their item still exists, still advances, and carries no identifying content.

- [X] T062 [P] [US7] **(RED)** `packages/client/tests/server/lifecycle-erasure.test.ts`: in-flight item persists through erasure (FR-FL-059); carries no reporter-identifying content (FR-FL-060); stays advanceable **and closable** (FR-FL-061); closure succeeds with no reporter to notify (SC-FL-010)
- [X] T063 [US7] **(GREEN)** Any controller changes needed so a detached item advances and closes without a reporter
- [X] T064 [US7] Render detached items without reporter attribution in `packages/client/src/components/admin/TriageQueue.tsx`
- [X] T065 [US7] **Playwright** extend `packages/client/e2e/lifecycle.e2e.ts` — erase a reporter, then advance and close their item

---

## Phase 10: Polish & cross-cutting

- [X] T066 [P] Deprecate `packages/client/app/api/v1/pipeline/**` — reads proxy to the new controller, writes refuse. **Kept, not deleted**: it is the surface `003` shipped and the current UI calls, and removing it in the same change that rewrites the model makes the diff unbisectable
- [X] T067 [P] Keep `POST /feedback/:id/promote` returning its idempotent response during the deprecation window, superseded by `PATCH /admin/lifecycle/:id {action:'accept'}`
- [X] T068 [P] Update `CLAUDE.md` §4 endpoint table and §5 data models for the lifecycle collection
- [X] T069 [P] Update `docs/decisions.md` with D1–D20 and the R1–R9 rationale
- [ ] T070 Release the agent: tag `agent-feedback-v*` and pin it in `docker-compose.prod.yml` **before** the app depends on the clause mode (research R3) — ⏸ **awaiting operator approval** (CLAUDE.md §14: automation covers the rollout, not the decision to ship). Prompt + eval are committed and live-verified; prod still runs the pre-mode image, which degrades to zero clauses
- [X] T071 Full gate: `npm run lint` (zero warnings) · `npm test` at threshold (≥80% backend, ≥70% frontend) · `npm -w packages/client run build` · `bash scripts/validate-e2e.sh --no-agent` · `npm -w packages/client run test:e2e`
- [ ] T072 Run `bash scripts/cut-release.sh <version>` — ⏸ **awaiting operator approval**, and blocked on T070 — never a bare `git tag`; it resolves the target from `origin/impl/nextjs` after fetching, which is what 4.14.0 failed

---

## Traceability

Every requirement maps to at least one task. `/speckit.analyze` checks this both ways — an
unmapped requirement is how a story ships half-done, and a task tracing to nothing is scope
nobody asked for.

**Functional**
FR-FL-001→T004,T005 · 002→T004,T005 · 003→T004,T013 · 004→T013,T014 · 005→T012 · 006→T020 ·
007→T004,T005,T044 · 008→T013,T014,T015,T018 · 009→T043,T044,T046,T048 · 010→T043,T044 · 011→T014,T044 ·
012→T012,T043 · 013→T014 · 014→T043,T044 · 015→T043,T044 · 016→T013,T014 · 017→T013,T014 ·
018→T058,T059,T060 · 019→T058,T059,T061 · 020→T019 · 021→T019 · 022→T016,T019,T022 · 023→T016,T017,T018 ·
024→T037,T038 · 025→T037,T041 · 026→T033,T034,T035,T037 · 027→T037,T038 · 028→T037,T038,T039,T042 ·
029→T037,T038,T041 · 030→T033,T036 · 031→T037,T038 · 032→T040 · 033→T040 · 034→T025,T026,T027,T031 ·
035→T025,T030 · 036→T028,T029,T021 · 037→T028,T029 · 038→T025,T026 · 039→T045 · 040→T053,T054 ·
041→T053,T055 · 042→T053,T055 · 043→T050,T051,T055 · 044→T051,T053,T057 · 045→T051,T057 ·
046→T049,T050 · 047→T052 · 048→T056 · 049→T053,T054 · 050→T053,T054 · 051→T053,T054 ·
052→T023,T031,T047 · 053→T031 · 054→T013,T045 · 055→T013 · 056→T046,T047 · 057→T045 · 058→T045 ·
059→T009,T010,T062 · 060→T009,T010,T062 · 061→T062,T063,T064,T065 ·
062→T073 · 063→T073 · 064→T075 · 065→T074 · 066→T076

**Intentionally untraced** (infrastructure and process, not behaviour — these trace to the
constitution and the repo's release rules rather than to an `FR-FL`): T001–T003 (setup),
T006–T008 (model + migration), T011 (CLAUDE.md rule), T066–T072 (deprecation, docs, agent
release, gates). Everything else maps.

**Success criteria**
SC-FL-001→T024,T057,T061 · 002→T032 · 003→T025,T058,T061 · 004→T012,T043 · 005→T037,T042 ·
006→T043 · 007→T045 · 008→T053,T057 · 009→T013,T045 · 010→T062

## Dependencies

**Blocking**: Setup (T001–T003) → Foundational (T004–T012) → all stories. Within Foundational:
`T004→T005`, `T006→T007→T008`, `T009→T010→T011`.

**Story order**: US1 (MVP) → US2 → US3 → US4 → US5 → US6 → US7. US6 and US7 depend only on
Foundational and can move earlier if wanted. US5 depends on US4 (closure needs `shipped`).

**Within a story**: RED before GREEN, always. Contract test → controller → route → UI → e2e.

## Parallel opportunities

- **Setup**: T001, T002, T003 together
- **Foundational**: T004 ‖ T006 ‖ T009 (different files); their GREEN tasks then serialise
- **US1**: T013 ‖ T016 ‖ T021 · **US3**: T033 ‖ T034 ‖ T037 · **US5**: T049 ‖ T052 ‖ T053
- **Polish**: T066–T069 together

## Implementation strategy

**MVP = Phase 1 + 2 + US1.** That alone replaces "promote and hope" with a recorded accept/dismiss
decision, and is independently shippable.

**Sequencing note that is not negotiable:** the erasure correction sits in **Foundational, not
US7**, despite being US7's subject. It fixes shipped behaviour that *deletes* lifecycle items
(research R4), and every story after it adds more data that would be destroyed. US7 then verifies
the behaviour as a story. Doing it in priority order would mean shipping six stories' worth of
work that erasure quietly throws away.

**Total: 76 tasks** — Setup 3 · Foundational 9 · US1 13 · US2 9 · US3 11 · US4 7 · US5 9 · US6 4 ·
US7 4 · Polish 7.

> **Task IDs are append-only.** T073 was added after `/speckit.analyze` (finding C1), and
> T074–T076 after validating against the design artifact (findings V1–V3). Each sits at the end of
> its phase rather than in numeric position and sits at
> the end of the US1 phase rather than in numeric position. Renumbering would invalidate every
> reference in `plan.md`, `research.md`, and the traceability map above — the same reason the
> spec's `FR-FL-*` numbering is append-only.
