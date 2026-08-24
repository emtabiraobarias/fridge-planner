# Handoff — feedback overhaul (spec 012 + 003 revision + 011 amendment)

**For a Claude Code session in the `fridge-planner` repository.** Self-contained: everything needed to author the specs is here. Design was settled in a Cowork session on 2026-08-23; no clarification questions remain.

**Visual reference:** https://claude.ai/code/artifact/226fba2c-a8f0-444f-8391-0050347c2a2d — the full lifecycle drawn out, all states, gates and terminal exits.

---

## 0. Do these before authoring anything

1. **Run the owed `main → impl/nextjs` sync.** `ROADMAP_PROGRESS.md` on `impl/nextjs` is dated 2026-08-04; `main`'s is 2026-08-07. The branch copy still says #15 is "release pending" and #16 is "NEXT" — both shipped (4.12.0, 4.13.0) — and it is missing the sync-rule paragraph that was added to prevent exactly this. Authoring new shared files on top of a stale baseline means reconciling two divergences at once later.
   ```bash
   bash scripts/sync-impls.sh
   ```

2. **Verify admin in production.** Sign in as the Keycloak admin and confirm `GET /api/v1/me` returns `isAdmin: true`. Since spec `011`, promotion, gate approvals and export are all admin-only — if the claim path is wrong, nobody can perform them, operator included. The fix is an `AUTH_ROLES_CLAIM` env change, not a rebuild.

3. **Decide on the cheap bug fix** (see §6). Optional, ~20 lines, removes a live user-facing defect.

---

## 1. What this is

The shipped feedback feature collects reports and then does almost nothing coherent with them. The operative finding, in the operator's words: *"the overall flow from feedback to admin approval to spec-driven development to completion loop is not defined at all."*

This is a **missing lifecycle**, not four broken screens. The work is to define that lifecycle once, end to end, and let the surfaces fall out of it.

---

## 2. Repo rules that govern this work

From `CLAUDE.md` and `specs/BRANCHING_STRATEGY.md` — violating any of these creates cleanup:

- **Spec/contract work is authored on `main`**, via a short-lived `feat/` branch off `main`, merged back to `main`. Implementation happens on `impl/nextjs`.
- **`origin/main` has disjoint history and contains no `packages/`.** Never base an implementation worktree on it.
- **Shared files** — `spec.md`, `checklists/*`, `ROADMAP_PROGRESS.md`, `constitution.md`, `scripts/smoke-test.sh` — are edited **only on `main`** and are byte-identical across branches.
- **Per-branch files** — `plan.md`, `tasks.md`, `CLAUDE.md`, `docs/*`, all code — **never exist on `main`**.
- **Cascade order is strict** (`CLAUDE.md` §11): `spec.md` → `/speckit.analyze` → `plan.md` → `tasks.md` → `checklists/` → constitution (only on a real conflict).
- **Playwright coverage is a standing gate.** Every new user-facing feature must add or extend e2e coverage of its primary journey as part of the story tasks. A feature is not done without it.
- After the spec lands on `main`: `bash scripts/sync-impls.sh`. `impl/vite` inherits and its build stays **deferred by decision**.

---

## 3. The specification boundary

**`003` owns producing a record. `012` owns everything that happens to a record once it exists.**

### `003` — retitle to *Conversational Feedback Capture*

**Keeps:** US1 report conversationally (FR-F-001/002/003/004) · FR-F-008 turn cap and forced finalize (now load-bearing — see D18) · FR-F-009 rate limit · FR-F-010 structured replies · FR-F-011 untrusted user content · US3 resume/discard (FR-F-012) · FR-F-019 **revised per D18** · FR-F-020 confirmed deletion · FR-F-005 per-record ownership.

**Moves to `012`:** FR-F-007 export · US2 review surface and FR-F-006 · US4 pipeline and FR-F-013..018 · US5 outcome reporting · FR-F-021 (split: capture-surface failures stay, maintainer-surface failures restated in `012`).

**Also:** flip Status out of *Draft*; rewrite `specs/003-feedback-agent/tasks.md`, which is currently 0/18 ticked and names `claude-sonnet-4-6` when the agent is OpenAI `gpt-4o`.

### `012` — new: *Feedback Lifecycle: triage to closure*

Numbering **`FR-FL-xxx`** (avoids `003` `FR-F-xxx`, `011` `FR-AD-xxx`, and the rest).

Owns: the stage model · the three gates · EARS drafting and vetting at `BRIEFED` · brief assembly · the five triage capabilities · dismissal reasons · the maintainer reply · reporter-visible status · closure composition (excerpt + release picker) · explicit closure · citation of closed records · both surfaces.

### `011` — amend, do not rewrite

Keeps the admin role definition, verified-claim sourcing, 403-not-401, the audit trail, and the general rule that maintainer actions require the role. The *definitions* of feedback-specific actions (FR-AD-009/010/011/012/013) become cross-references to `012`. Mark the "Current-state finding" section historical. **FR-AD-018's open erasure edge case is resolved by D15.**

---

## 4. Decisions — all FIXED, paste into Clarifications

| # | Decision |
|---|---|
| D1 | **Genuinely multi-user.** Real reporters the operator does not personally know. Privacy between reporters, attribution and status-back are first-class. |
| D2 | **The conversation is unchanged.** Capture pain is everything around the chat, not the chat. |
| D3 | **The app generates a ready-to-run brief; a human starts every run.** No in-app job runner, no scheduler, no agent holding repo credentials. |
| D4 | **The maintainer advances stages explicitly**, brief-assisted. No GitHub integration for stage movement. (Narrowly amended by D17.) |
| D5 | **Three gates: accept → spec-approved → pre-merge/release.** |
| D6 | **Status plus a maintainer reply.** No push notifications this increment. |
| D7 | **Two surfaces.** One reporter surface; one maintainer surface carrying triage *and* delivery. |
| D8 | Triage can: dismiss with reason · merge duplicates · edit the record before it briefs · prioritise the queue · improve and redefine the specification. |
| D9 | **The maintainer closes explicitly.** Nothing auto-closes on merge or release. |
| D10 | Revise `003` to capture only · new `012` for the lifecycle · amend `011`. |
| D11 | **`BRIEFED` is a real stage** — D20 gives it real work. |
| D12 | **`IN-PROGRESS` is a real stage** — it buys the reporter "being specified" vs "being built". |
| D13 | **`CLOSED` never reopens.** A wrongly-fixed problem is a **new** report that **cites** the closed one. |
| D14 | **A merged reporter sees the target's status only** — never its detail. |
| D15 | **Work outlives an erased account** — the item survives detached from its reporter. |
| D16 | **EARS for requirement sections**, scoped — see §5. |
| D17 | **Closure composes a maintainer-written excerpt (pre-filled) plus a release picked from a list** of the repository's published releases — see §5. |
| D18 | **Quick capture asks before it interrupts.** The modal asks whether the reporter has a minute to elaborate. Yes → conversation opens with the question waiting. No → recorded as it stands. Revises `FR-F-019`. |
| D19 | **Dismissal carries a reason:** `no-action-required` (works as intended, praise, a question answered) or `declined` (a fair request, not being built). |
| D20 | **EARS clauses are drafted at `BRIEFED` and vetted clause-by-clause** before the brief leaves — see §5. |

### Decisions that overturn earlier fixed ones — make the cascade deliberate

1. `003` Assumption 9 excluded a maintainer-facing spec editor. **D8 brings it in; D20 goes further.**
2. `003` FR-F-015 / SC-F-007 promise *"zero hand-maintained tracking."* **D4 keeps tracking hand-advanced — restate honestly in `012`,** do not inherit an unmet criterion.
3. `003` Assumption 7 models a single maintainer who *is* the promoting user. **D1 replaces it.**
4. `003` FR-F-014 allows park/reopen as the only non-forward transition. **D13 adds: no transition out of `CLOSED` at all.**
5. `003` FR-F-019 mandates an unconditional hand-off. **D18 makes it conditional on consent** and adds the forced-finalize path. The honesty clause is untouched and governs both branches.
6. D4 ruled out GitHub integration. **D17 narrowly reopens it** — read-only, one endpoint, for the release picker alone; it never drives a stage.

### ⚠ D18's load-bearing consequence — do not lose this

**"Record as-is" must NOT mean "leave it as a draft."** A draft cannot be exported, briefed or promoted, and its only action is Delete — precisely the dead end the 2026-07-28 revision removed, and re-creating it would undo `SC-F-009`. **Declining routes to the forced-finalize path** already built for the 30-turn cap (`FR-F-008`): the assistant finalises on that single turn and explicitly marks the fields it had to guess. The record reaches triage `complete` but visibly thin; D8's "edit before it briefs" is the repair tool.

*Minor, confirm while drafting:* the design assumes the question is asked **in the modal before sending**. The alternative — send first, ask only if the assistant returned a question — asks fewer unnecessary questions but makes the reporter wait.

---

## 5. The three mechanisms that need care

### Stage model

```
new ──accept(GATE 1)──▶ accepted ──▶ briefed ──▶ in-spec
                                        │            │
                            EARS drafted + vetted    │
                                             spec-approved (GATE 2)
                                                     ▼
                                                in-progress ──▶ in-review
                                                                    │
                                                     release-approved (GATE 3)
                                                                    ▼
                                                                 shipped ──close──▶ closed
new/accepted ──dismiss──▶ dismissed (terminal; reason: no-action-required | declined)
any active ──park──▶ parked ──reopen──▶ back to prior stage
duplicate ──merge──▶ merged-into <record> (terminal, status visible only)
closed ◀──cites── a later report (reference only, never a transition)
GATE 2 rejection ──▶ back to the clauses at briefed, never back to the reporter
```

Invariants to carry forward from `003` and state explicitly in `012`: no transition ever merges, tags or deploys · report text is data, never instruction · every transition logs actor and time, gates log *which* administrator · stage never moves backward implicitly · reporters are isolated from each other · maintainer controls never render for a reporter *and* are refused server-side · a record in an active stage cannot be deleted.

### EARS (D16, D20)

Patterns: ubiquitous `The system shall…` · event-driven `When <trigger>, the system shall…` · state-driven `While <state>, the system shall…` · unwanted behaviour `If <trigger>, then the system shall…` · optional `Where <feature>, the system shall…`

**Two places it applies:** (1) the requirement sections of `012` and the revised `003`; (2) per-record drafting at `BRIEFED`, vetted by the maintainer.

**Why the value is atomicity, not style:** today's requirements bundle several behaviours into one identifier — `FR-F-019` carries four — so "implemented" can be partly true. That is structurally how three stale maintainer controls shipped. One trigger, one response, one requirement, one test, matching the repo convention of naming the FR in the test name.

**Four rules on the `BRIEFED` drafting:**
1. **Draft, never authority** — no record reaches `IN-SPEC` without every clause vetted.
2. **Vetting is a comparison, not a proofread** — each clause displayed beside the record text it came from. Treat this as load-bearing: well-formed EARS is easy to accept uncritically, and a model can produce beautifully-shaped clauses that are subtly wrong.
3. **Derive only, never invent** — clauses come from what the record states; anything inferred is marked, as forced-finalize marks its guesses. Adding new requirements is the maintainer's act.
4. **Provisional identifiers** until `/speckit.specify` promotes them, so nothing unvetted wears a real `FR-` number.

**Bounds:** do not retro-convert the shipped specs · do not replace user stories or Given/When/Then · **do not push EARS into the capture agent's output schema** (`FR-F-003`) — mid-conversation it produces stilted nonsense where Given/When/Then degrades gracefully · update `.specify/templates/spec-template.md` only after `012` ships.

**Plan-level note:** prefer extending the existing `feedback-collector` agent with a second mode over adding a third Holodeck container — the untrusted-data framing already lives there.

**Honest limit:** EARS is a syntax, not a methodology. It would not have prevented any `003`/`011` contradiction — those came from documents drifting apart, which only cascade discipline fixes.

### Closure composition (D17)

- **A short excerpt**, maintainer-written from **pre-filled text seeded from the record** (the reporter's own title and problem statement — the excerpt is written *for them*; the release body is written for you). An excerpt keeps exposure chosen, where a whole release note may name branches, unrelated features or other people's work.
- **A release link** chosen from a list of the repository's published releases.

**This introduces the app's first outbound GitHub dependency.** Specify it as one:
- Cache the list — unauthenticated reads are rate-limited and releases change rarely.
- **Degrade, never block** — if GitHub is unreachable, closing falls back to free text and says why. Closure must never be gated on a third party.
- Declare it in `/api/health/ready` alongside mongodb, meal-recommender and feedback-agent.
- Works unauthenticated today because the repo is public-readable; if it is ever made private this becomes a token-holding integration.

---

## 6. Known defects the overhaul should absorb

Verified against `impl/nextjs` at `4a16997`:

1. **Three maintainer controls render for end users.** `useIsAdmin` gates only the "Open administration" link. Export (`FeedbackHistory.tsx`), "Promote to development" (`PromoteButton.tsx`) and every pipeline transition button (`PipelineStatusView.tsx` `actionsFor()`) render for any authenticated user, hit admin-guarded routes and 403 with *"Please try again"* — which misstates the reason. No test covers it because no requirement was ever written for it. **D7's surface split is the structural fix.**
   > **Judgment call:** if `012` ships within a couple of weeks, let the overhaul carry this. If it is a longer project, gate the three controls behind `useIsAdmin` now as a standalone bug-fix PR — ~20 lines, low risk, and it removes a live defect users are hitting today. Add the component test that would have caught it.

2. **Cross-user promotion is a one-way door.** An admin can promote another user's report, but the resulting `PipelineItem` is owned by the author, `GET /pipeline` is `{userId}`-scoped, there is no `/api/v1/admin/pipeline` route, and `AdminPage.tsx` renders only `FeedbackTriageList` and `UserDataPanel`. The item id appears once — in the promote response — and nowhere afterwards. **D7's combined triage-and-delivery surface is the fix.**

3. **`specs/003-feedback-agent/tasks.md` is not a usable record** — 0/18 ticked despite shipping, and content-stale. Rewrite it in the `003` cascade. (`dev-loop/tasks.md` is 41/41 and accurate.)

---

## 7. Command sequence

```bash
# 0. clean baseline
bash scripts/sync-impls.sh

# 1. spec work on main
git checkout main && git pull
.specify/scripts/bash/create-new-feature.sh 012-feedback-lifecycle

# 2. author — decisions above are FIXED, so /speckit.clarify is skippable
#    /speckit.specify   → spec.md with D1–D20 baked into Clarifications
#    /speckit.checklist → checklists/requirements.md

# 3. the other two documents, same branch
#    revise specs/003-feedback-agent/spec.md  (scope down, FR-F-019 per D18, Status out of Draft)
#    amend  specs/011-admin-capabilities/spec.md (cross-reference 012, FR-AD-018 via D15, mark audit historical)
#    re-cut specs/003-feedback-agent/checklists/acceptance-scenarios.md across the new split

# 4. land and propagate
#    PR → main, then:
bash scripts/sync-impls.sh

# 5. implementation, on impl/nextjs
git checkout impl/nextjs
#    /speckit.plan → /speckit.tasks → /speckit.analyze → /speckit.implement
#    remember: Playwright coverage of the primary journey is part of the story tasks
```

---

## 8. Traps that will cost an hour each

- **Never run `npm run build` while `next dev` is running** — both use `.next`.
- **Bare `npx playwright test` serves a stale `.next-e2e`** — only `npm run test:e2e` rebuilds.
- **`db.ts` reads `MONGODB_URI` at module scope** — import routes *after* setting it, or server tests silently bind to a real local Mongo.
- **The rate limiter is module-level state surviving between tests** — reset the key in `beforeEach`.
- **`it.each` expands at collection time** — a table built in `beforeAll` registers zero cases.
- **`AUTH_DEV_ROLES` applies only to requests with no `x-user-id` header.** A broader fallback once promoted every header-identified E2E request to administrator and turned refusal assertions green for the wrong reason.
- **Server tests need a downloadable MongoDB binary.** They could not run in the Cowork sandbox (`fastdl.mongodb.org` blocked); they run fine on GitHub-hosted runners.

---

## 9. Opening prompt for the Claude Code session

> I'm starting the feedback overhaul in `fridge-planner`. Read `docs/handoff-feedback-overhaul.md` — it carries twenty fixed design decisions from a prior design session, the specification boundary between specs `003`, `011` and the new `012`, and the repo rules that govern the work. No clarification questions remain; do not re-open settled decisions.
>
> Start with §0 prerequisites, then author spec `012` on a `feat/` branch off `main` per §7. Follow the `CLAUDE.md` §11 cascade order strictly, use `FR-FL-xxx` numbering, and write the requirement sections in EARS per §5. Flag anything in the handoff that contradicts what you find in the tree before acting on it.
