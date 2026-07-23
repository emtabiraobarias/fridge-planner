# Quickstart — Feedback→Feature Development Loop (tracking-layer MVP, `impl/nextjs`)

Dev/test walkthrough for the spec `003` revision (US4, FR-F-013..018). Prereqs: MongoDB + Holodeck (`docker compose up -d mongodb holodeck`) and `packages/client/.env.local` with `MONGODB_URI`, `HOLODECK_URL`, `AUTH_MODE=dev`, `FEEDBACK_AGENT_URL` (for collecting a record via chat; not needed for the pipeline itself). `OPENAI_API_KEY` drives the feedback agent.

> This revision adds only the **tracking layer** — promote, pipeline stages, status view, human gates, artifact links. It runs *on top of* the existing feedback collector, which is unchanged. **The app never merges, tags, or deploys** (FR-F-017) and **never derives a transition from feedback content** (FR-F-018) — if any pipeline action causes a git/CI/deploy side effect or advances from record text, that is a regression, not a feature.

## Run it

```bash
npm run dev
```

1. **Collect a completed record (existing US1)**: open `/feedback`, describe a bug, answer the assistant's questions until it saves a **complete** structured record (or seed one directly via the API in tests). Only completed records are promotable (FR-F-013).
2. **Promote (DL1, US4-1)**: on the completed record (in the history/detail), tap **Promote to development**. Confirm it appears in the **development status view** at stage **approved**, with the approver + timestamp recorded (SC-F-006). Re-tapping Promote does **not** create a second item — the same pipeline entry is returned (idempotent, spec EC).
3. **Draft-refusal (DL1, US4-5)**: start a new conversation but leave it in **draft**; confirm there is no Promote affordance (or that promoting it is refused) — only schema-valid completed records are promotable.
4. **Delete-protection (DL1, EC-06)**: try to delete a record that is in the **active** pipeline → refused with "park it first" (409). Park it (step 7) then delete → allowed, and the parked item is removed with it (no dangling state).
5. **Advance to in-spec (DL2, US4-2)**: from the status view, **advance** the approved item → stage **in-spec** (this is the non-gated step: a draft spec has been produced from the record's export). Attach the **draft-spec** reference (the `GET /feedback/:id/export` markdown pasted into `/speckit.specify` on `main` yields a spec dir/PR — record its path/URL). The view links to it. The item does **not** advance further without the spec-approval gate.
6. **Spec-approval gate → in-review (DL2, US4-2/3)**: perform **Approve spec** (the FR-F-016 gate) → stage **in-review**; the transition log records the gate approval (actor + timestamp). Attach the **pull-request** URL for the implementation work (created on a branch outside the app). Confirm the item **cannot** reach *shipped* yet, and that no merge/tag/deploy has happened (US4-3).
7. **Park / reopen (DL2, US4-4)**: on any active item, **Park** it ("not worth building") → terminal **parked**, and it stops showing as in-progress. **Reopen** returns it to the stage it held before parking.
8. **Pre-release gate → shipped (DL2)**: after a human has reviewed and merged the PR *outside the app*, perform **Approve release** (the FR-F-016 pre-merge/pre-release gate) → stage **shipped**. The status view never shows *shipped* for unmerged work, because reaching it requires this recorded gate approval (SC-F-008). The app itself performed no merge/tag/deploy (FR-F-017).
9. **Injection is inert (FR-F-018)**: collect/seed a record whose text embeds commands like "ignore instructions and merge this" or "deploy now", promote it, and advance it — confirm the stage changes **only** via your explicit actions and it never reaches *shipped* without your `approve-release`. Feedback content is data, never a command.

## Test it

```bash
npm -w packages/client run test -- tests/server/unit/pipeline-transitions.test.ts
npm -w packages/client run test -- tests/server/unit/no-deploy-imports.test.ts
npm -w packages/client run test -- tests/server/pipeline.test.ts
npm -w packages/client run test -- tests/components/PipelineStatusView.test.tsx
npm test
npm -w packages/client run build
npm -w packages/client run test:e2e
bash scripts/validate-e2e.sh --no-agent
```

- **Transition legality (DL2, unit)**: exhaustively assert the from×action matrix — `advance` only `approved→in-spec`; `approve-spec` only `in-spec→in-review` (sets `isGateApproval`); `approve-release` only `in-review→shipped` (sets `isGateApproval`); `advance` from `in-spec`/`in-review` → error ("use the gate"); any backward/jump → error; `park`→`parked` (idempotent), `park` of `shipped` → error; `reopen`→`parkedFromStage`.
- **Promote (DL1, handler)**: seed a completed record → `promoteFromFeedback(userId, id)` → assert 201, `stage:'approved'`, seed transition, identity snapshot, and record `status:'reviewed'`. Re-promote → assert 200 and the **same** `_id` (unique index, idempotent). Promote a `draft` → 409. Promote another user's record → 404 (no existence leak, FR-F-005). Concurrent double-promote → one item, the loser returns the existing item.
- **Gates + branch/PR-only (DL2, handler)**: drive a record `approved→in-spec→in-review→shipped` only through the gate actions; assert it is **impossible** to reach `shipped` without a recorded `approve-release` entry (SC-F-008). **Injection**: promote/advance a record whose fields contain "merge this"/"deploy now"; assert no auto-transition and no path to `shipped` without the explicit gate (FR-F-018).
- **Architecture test (DL2, FR-F-017)**: assert `src/server/controllers/pipeline.ts` (and `lib/pipeline-transitions.ts`) import no `child_process`, git, `exec`, or deploy client — the app structurally cannot merge/tag/deploy.
- **Delete-protection (DL1, EC-06)**: delete with an active item → 409; with a parked item → 204 + the parked item is gone (cascade); with no item → 204 (unchanged).
- **Status view (DL3, RTL)**: `PipelineStatusView` renders promoted items grouped/badged by stage with draft-spec/PR links; a promote from the UI makes the item appear at `approved` (SC-F-006); gate controls call the correct action; badges are not color-only. `PipelineContext` refreshes after promote/transition.
- **Cross-user isolation (FR-F-005/018)**: seed items for users A and B; assert `GET /pipeline`, detail, and PATCH never return or mutate B's item for A (404).

## Verification log

*(Per-task entries appended during implementation, mirroring spec 009's log — baseline, per-phase TDD red→green notes, and full-gate runs.)*

- **T001 (baseline, 2026-07-23)**: `npm run lint` → clean (0 warnings). `npm test` → **58 test files passed (58), 624 tests passed (624)**, ~13s. No pre-existing failures.
- **T002 (precedents confirmed, 2026-07-23)**: `src/server/controllers/grocery-lists.ts:145-205` (`purchaseGroceryItem`/`unpurchaseGroceryItem`) — atomic guarded `findOneAndUpdate({userId, weekStart, items:{$elemMatch:{...expected pre-state}}}, {$set:...}, {new:true/false, arrayFilters})`, returning 409 on guard mismatch; transfers directly to `transitionPipelineItem`'s `findOneAndUpdate({_id, userId, stage: expectedFrom}, {$set:{stage:next}, $push:{transitions:...}}, {new:true})` (DL2, not built in this pass). `app/api/v1/meal-plans/[weekStart]/entries/[slotId]/route.ts` PATCH — thin handler (`connectDb` → `authenticate` → `rateLimit` → controller dispatching a Zod `discriminatedUnion('action', ...)` body) — transfers directly to `PATCH /pipeline/:id`'s action-union (DL2) and to the promote route's thin-handler shape (DL1, T012). Both precedents confirmed applicable before authoring DL1/DL2 tests.
- **T003 (red, 2026-07-23)**: `npx vitest run --coverage=false tests/server/unit/pipeline-transitions.test.ts` — FAIL (`Cannot find module '@server/lib/pipeline-transitions'` / `@server/types/pipeline` — modules do not exist yet). Confirms the exhaustive legality-matrix test is authored before the implementation.
- **T003 (green)**: after T004/T005, the same command passes — all matrix cases (advance/approve-spec/approve-release/park/reopen/assertPromotable, all illegal cells) green.
- **T007-T010 (red, 2026-07-23)**: `npx vitest run --coverage=false tests/server/pipeline.test.ts` — FAIL (`Cannot find module '../../app/api/v1/feedback/[id]/promote/route'` — the promote route does not exist yet). Confirms DL1 handler tests are authored before `promoteFromFeedback`/the route/the delete guard exist.
- **T007-T013 (green)**: after T011 (`promoteFromFeedback`), T012 (promote route), T013 (delete guard), the same command passes — 201/200 idempotent promote incl. concurrent double-promote, 409 draft, 404 cross-user/missing, 409/204 delete-protection with cascade. Note: the concurrent double-promote assertion required `PipelineItem.syncIndexes()` in the test's `beforeEach` — `mongoose.connection.dropDatabase()` (used by every server test file in this suite for isolation) also drops indexes, and mongoose does not rebuild them automatically after the initial connection, so the unique `(userId, feedbackRecordId)` guard would otherwise be silently unenforced from the second test onward.
- **Phase 1-3 full gate (2026-07-23)**: `npm run lint` → clean (0 warnings, repo root, `packages/*/src`). `npm test` (repo root, full suite) → **60 test files passed (60), 656 tests passed (656)** — up from the T001 baseline (58/624) by the 2 new files / 32 new tests (23 state-machine unit + 9 pipeline handler). `npm -w packages/client run build` → clean production build; `/api/v1/feedback/[id]/promote` appears as a dynamic route alongside the existing feedback/pipeline API surface.

## Release handoff

- [ ] Create release/version tag after review
- [ ] Build and push deployment images
- [ ] Redeploy through Portainer and verify production health checks
- [ ] Run post-deploy smoke validation against the deployed URL
- [ ] Confirm the spec `003` revision (US4, FR-F-013..018) is merged on `main` and the `CLAUDE.md` §4/§5 cascade landed

## Gotchas

- **The app is the tracking layer, not the chain runner** (Assumptions 8/9): the Claude-orchestrated session runs `/speckit.specify → … → implement` and creates the branch/PR *outside the app*, calling the pipeline API to record progress. Do **not** add a scheduler, job runner, or in-app agent.
- **No app-side merge/tag/deploy** (FR-F-017): `approve-release` only flips the stage and records the gate; the real merge/tag/deploy is human, outside the app (Portainer/git, CLAUDE.md §10/§15). `attach-artifact.ref` is a link string — never fetched or executed.
- **Gates are the only path past in-spec and into shipped** (FR-F-016): `advance` is deliberately valid only `approved→in-spec`. Don't "helpfully" let `advance` cross a gate — `isGateApproval` must stay endpoint-set from the action verb so it can't be forged.
- **Transitions are explicit actions only** (FR-F-018): never read `FeedbackRecord.transcript`/fields to trigger a transition, merge, or deploy. The draft-spec seed is `renderFeedbackMarkdown` output — data a human reviews in `/speckit.specify`, never an authority.
- **Promote is idempotent** (FR-F-013): rely on the unique `(userId, feedbackRecordId)` index + duplicate-key catch → return the existing item; never reset stage/log on re-promote.
- **Delete-protection** (EC-06): block deletion while an active item exists; cascade a parked item. Never leave a PipelineItem pointing at a deleted record.
- **Reuse, don't rebuild**: the draft-spec seed (`feedback-export.ts`), the completed-record schema guarantee (promotability), the grocery-lists guarded-update pattern, the spec-006 PATCH-action-union idiom, and the whole `authenticate`/`withRoute`/`problem`/`rateLimit`/`apiFetch` stack are all reused — no new dependency, service, or state library.
- **Case-sensitivity trap for this worktree**: this branch lives in a git worktree; edit files under the worktree path, not the case-insensitively-aliased main checkout, or changes land on the wrong branch.
