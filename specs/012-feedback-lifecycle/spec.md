# Feature Specification: Feedback Lifecycle — triage to closure

**Feature Branch**: `feat/012-feedback-lifecycle`
**Created**: 2026-08-24
**Status**: Draft
**Input**: Design session 2026-08-23 (decisions D1–D20, all FIXED). Supersedes the lifecycle
half of `003` and takes ownership of the feedback-specific actions defined in `011`.

---

## Why this exists *(mandatory reading)*

The shipped feedback feature collects reports and then does almost nothing coherent with
them. In the operator's words: *"the overall flow from feedback to admin approval to
spec-driven development to completion loop is not defined at all."*

This is a **missing lifecycle**, not four broken screens. `003` proved a report can be
captured well. What was never specified is what happens to a report **after** it exists:
who decides it is worth doing, how a reporter learns anything, what "done" means, and who
says so. The surfaces that exist today are the visible symptom — controls that render for
people who cannot use them, a pipeline item whose id appears once and is never seen again,
and a status view nobody outside the operator's own account can act on.

This spec defines that lifecycle once, end to end, and lets the surfaces fall out of it.

### The specification boundary

**`003` owns producing a record. `012` owns everything that happens to a record once it
exists.** `011` continues to own *who may act* (the administrator role, verified-claim
sourcing, refusal semantics, the audit trail); this spec defines *what those actions are*.

---

## Clarifications

### Session 2026-08-23 (design session; all decisions FIXED — do not re-open)

- Q: Who reports? → A: **D1 — genuinely multi-user.** Real reporters the operator does not
  personally know. Privacy between reporters, attribution, and status-back are first-class,
  not conveniences. This replaces `003` Assumption 7, which modelled a single maintainer who
  *is* the promoting user.
- Q: Does the capture conversation change? → A: **D2 — no.** Capture pain is everything
  around the chat, not the chat. `003`'s conversational flow is kept intact.
- Q: Does the app run the development work? → A: **D3 — no.** The app generates a
  ready-to-run brief; a **human starts every run**. No in-app job runner, no scheduler, and
  no agent holding repository credentials.
- Q: How do items move between stages? → A: **D4 — the maintainer advances stages
  explicitly**, brief-assisted. No GitHub integration drives stage movement. (Narrowly
  amended by D17 for the release picker only.)
- Q: How many approval gates? → A: **D5 — three: accept → spec-approved →
  pre-merge/release.**
- Q: How does a reporter learn anything? → A: **D6 — status plus a maintainer reply.** No
  push notifications in this increment.
- Q: How many surfaces? → A: **D7 — two.** One reporter surface; one maintainer surface
  carrying triage *and* delivery. This split is the structural fix for the maintainer
  controls that currently render for every authenticated user.
- Q: What can triage do? → A: **D8 — dismiss with reason · merge duplicates · edit the
  record before it briefs · prioritise the queue · improve and redefine the specification.**
  This overturns `003` Assumption 9, which excluded a maintainer-facing spec editor.
- Q: What closes an item? → A: **D9 — the maintainer closes explicitly.** Nothing
  auto-closes on merge or release.
- Q: How is the work split across specs? → A: **D10 — revise `003` to capture only, add
  `012` for the lifecycle, amend `011`.**
- Q: Is `BRIEFED` a real stage or a label? → A: **D11 — a real stage.** D20 gives it real
  work: EARS clauses are drafted and vetted there.
- Q: Is `IN-PROGRESS` a real stage? → A: **D12 — yes.** It buys the reporter the distinction
  between "being specified" and "being built", which is the difference they actually feel.
- Q: Can a closed item reopen? → A: **D13 — never.** A wrongly-fixed problem is a **new**
  report that **cites** the closed one. This extends `003` FR-F-014, which allowed
  park/reopen as the only non-forward transition.
- Q: What does the reporter of a duplicate see? → A: **D14 — the target's status only**,
  never its detail. Reporters must stay isolated from each other (D1).
- Q: What happens when a reporter's account is erased? → A: **D15 — the work outlives the
  account.** The lifecycle item survives, detached from its reporter. This resolves `011`
  FR-AD-018's open erasure edge case.
- Q: What syntax do requirements use? → A: **D16 — EARS for requirement sections**, scoped
  per the rules below.
- Q: What does closure communicate? → A: **D17 — a maintainer-written excerpt (pre-filled
  from the record) plus a release chosen from a list** of the repository's published
  releases. This narrowly reopens D4's "no GitHub integration": read-only, one endpoint, for
  the release picker alone, and it never drives a stage.
- Q: Does quick capture always hand off to the conversation? → A: **D18 — it asks first.**
  The modal asks whether the reporter has a minute to elaborate. Yes → the conversation opens
  with the question waiting. No → the note is recorded as it stands. This revises `003`
  FR-F-019, which mandated an unconditional hand-off.
- Q: What reason accompanies a dismissal? → A: **D19 — `no-action-required`** (works as
  intended, praise, a question answered) **or `declined`** (a fair request, not being built).
- Q: Who writes the EARS clauses? → A: **D20 — they are drafted at `BRIEFED` and vetted
  clause-by-clause** by the maintainer before the brief leaves.

### Decisions that overturn earlier fixed ones

These are deliberate reversals, recorded so the cascade is honest rather than silent:

1. `003` Assumption 9 excluded a maintainer-facing spec editor. **D8 brings it in; D20 goes
   further.**
2. `003` FR-F-015 / SC-F-007 promise *"zero hand-maintained tracking."* **D4 keeps tracking
   hand-advanced.** That criterion is **not inherited** — it is restated honestly here as
   FR-FL-011 and SC-FL-004. An unmet success criterion must not be carried forward.
3. `003` Assumption 7 models a single maintainer who *is* the promoting user. **D1 replaces
   it.**
4. `003` FR-F-014 allows park/reopen as the only non-forward transition. **D13 adds: no
   transition out of `closed` at all.**
5. `003` FR-F-019 mandates an unconditional hand-off. **D18 makes it conditional on
   consent** and routes refusal to the forced-finalize path. The honesty clause is untouched
   and governs both branches.
6. D4 ruled out GitHub integration. **D17 narrowly reopens it** — read-only, one endpoint,
   for the release picker alone; it never drives a stage.

### The load-bearing consequence of D18

**"Record as-is" must NOT mean "leave it as a draft."** A draft cannot be exported, briefed
or promoted, and its only action is Delete — precisely the dead end the 2026-07-28 revision
removed, and re-creating it would undo `SC-F-009`. Declining to elaborate therefore routes to
the **forced-finalize path** already built for the 30-turn cap (`003` FR-F-008): the assistant
finalises on that single turn and **explicitly marks the fields it had to guess**. The record
reaches triage `complete` but visibly thin; D8's "edit before it briefs" is the repair tool.

**RESOLVED 2026-08-24 (operator decision) — the consent question is asked in the modal, before
sending.** The reporter decides while still typing, so nothing is added to the wait and the branch
is known before the request leaves.

The alternative considered — send first, ask only if the assistant returned a question — asks
strictly fewer unnecessary questions, but pays an agent round-trip (60s timeout) on *every*
capture before the reporter learns whether they are done, which is the exact latency quick capture
exists to avoid. It was rejected on evidence, not preference: the agent's instructions mandate
exactly one clarifying question whenever detail is still missing, and it is tuned to produce
records usable *verbatim as specification input*, so a one-line note essentially never clears that
bar. `003`'s own 2026-07-28 revision records that the assistant **"almost always answers a first
message with a clarifying question"**, reproduced live on 2026-07-27. That option therefore
optimises a case that barely occurs while charging the wait every time.

A third option — fire the request and show the question concurrently, dropping it if the assistant
finishes first — was also rejected: the modal can change under the reporter mid-answer, which is
the same "control appears then vanishes" defect PR #76 had just removed.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - The maintainer triages an incoming report (Priority: P1)

A report arrives. The maintainer decides whether it becomes work at all, and the decision is
recorded rather than implied by silence.

**Why this priority**: Nothing else in the lifecycle can happen until a report is accepted or
dismissed. This is gate 1 and the entry point to every other story.

**Independent test**: Submit a report as one user; as the maintainer, accept it and observe it
enter `accepted`; dismiss another and observe it reach `dismissed` with a reason.

**Acceptance scenarios**:

1. **Given** a `complete` report in `new`, **When** the maintainer accepts it, **Then** the
   item moves to `accepted` and the transition records the acting administrator and time.
2. **Given** a report in `new`, **When** the maintainer dismisses it as `no-action-required`,
   **Then** the item moves to `dismissed`, the reason is stored, and no further transition is
   offered.
3. **Given** a report in `new`, **When** the maintainer dismisses it as `declined`, **Then**
   the item moves to `dismissed` with that reason recorded distinctly from
   `no-action-required`.
4. **Given** a thin forced-finalize record, **When** the maintainer edits its fields before
   briefing, **Then** the edited content is what proceeds, and the edit is attributed.
5. **Given** an authenticated non-maintainer, **When** they attempt any triage action,
   **Then** the server refuses it and no state changes.

---

### User Story 2 - The reporter learns what happened (Priority: P2)

A reporter opens their own feedback and sees where each report stands, and any reply the
maintainer wrote for them.

**Why this priority**: D1's multi-user premise is worthless if reporting is a void. This is
the whole return the reporter gets.

**Independent test**: As a reporter, submit a report; as the maintainer, advance and reply to
it; as the reporter, observe the new stage and the reply, and observe no other reporter's
report anywhere.

**Acceptance scenarios**:

1. **Given** a report the reporter submitted, **When** they view their feedback, **Then** they
   see its current stage in reporter-facing language.
2. **Given** a maintainer has written a reply, **When** the reporter views the report,
   **Then** the reply is shown attributed to the maintainer.
3. **Given** reports submitted by other people, **When** a reporter views their feedback,
   **Then** none of those reports are listed or reachable.
4. **Given** a reporter, **When** their surface renders, **Then** no maintainer control
   appears, and were one to be invoked the server would refuse it anyway.

---

### User Story 3 - Requirements are drafted and vetted before work starts (Priority: P3)

At `briefed`, EARS clauses are drafted from the record and the maintainer vets them
clause-by-clause against the reporter's own words. Only a fully vetted item can proceed.

**Why this priority**: This is what makes `briefed` a real stage (D11/D20) and is the quality
gate that prevents work starting from a misunderstanding.

**Independent test**: Move an accepted item to `briefed`, observe drafted clauses each shown
beside the record text they derive from, accept some and reject others, and confirm the item
cannot reach `in-spec` while any clause is unvetted.

**Acceptance scenarios**:

1. **Given** an item entering `briefed`, **When** clauses are drafted, **Then** each clause is
   displayed beside the record text it was derived from.
2. **Given** a drafted clause containing anything not stated in the record, **When** it is
   presented, **Then** it is visibly marked as inferred.
3. **Given** an item with at least one unvetted clause, **When** advancement to `in-spec` is
   attempted, **Then** it is refused and the item stays at `briefed`.
4. **Given** all clauses vetted, **When** the maintainer assembles the brief, **Then** the
   brief contains the vetted clauses and is ready to run by a human.
5. **Given** drafted clauses, **When** they are stored, **Then** they carry provisional
   identifiers and never a real `FR-` number.

---

### User Story 4 - The maintainer moves work through the gates (Priority: P4)

The maintainer advances an item through `in-spec`, `in-progress` and `in-review`, passing the
spec-approval and release-approval gates explicitly.

**Why this priority**: D12's reporter-visible distinction between "being specified" and "being
built" depends on these stages existing and moving.

**Independent test**: Walk an item from `briefed` to `shipped`, confirming each gate requires
an explicit approval and that no transition performs any repository action.

**Acceptance scenarios**:

1. **Given** an item at `in-spec`, **When** the maintainer approves the specification,
   **Then** the item moves to `in-progress` and the approval records which administrator gave
   it.
2. **Given** an item at `in-review`, **When** the maintainer approves the release, **Then** the
   item moves to `shipped`.
3. **Given** an item at `in-review`, **When** spec approval is attempted instead, **Then** it
   is refused as an illegal transition and nothing changes.
4. **Given** a rejected specification at gate 2, **When** it is rejected, **Then** the item
   returns to the clauses at `briefed` and never to the reporter.
5. **Given** any transition, **When** it completes, **Then** no commit, merge, tag, or deploy
   has occurred.
6. **Given** an active item, **When** the maintainer parks it, **Then** it moves to `parked`
   and can later be reopened to the stage it was parked from.

---

### User Story 5 - The maintainer closes the loop (Priority: P5)

The maintainer closes a shipped item with a short excerpt written for the reporter and a link
to the release it shipped in.

**Why this priority**: D9 makes closure the only thing that ends a lifecycle, and it is the
moment the reporter finally gets an answer.

**Independent test**: Close a `shipped` item, composing an excerpt from pre-filled text and
picking a release; confirm the reporter sees both; confirm closure still works with the
release list unavailable.

**Acceptance scenarios**:

1. **Given** a `shipped` item, **When** the maintainer opens closure, **Then** the excerpt
   field is pre-filled from the reporter's own title and problem statement.
2. **Given** closure composition, **When** the maintainer picks a release, **Then** the choice
   comes from the repository's published releases.
3. **Given** the release list is unreachable, **When** the maintainer closes the item, **Then**
   closure proceeds with free text and states why the list was unavailable.
4. **Given** a closed item, **When** any transition is attempted, **Then** it is refused —
   `closed` is terminal.
5. **Given** a closed item, **When** a later report cites it, **Then** the citation is a
   reference only and moves nothing.

---

### User Story 6 - Duplicates collapse without leaking (Priority: P6)

The maintainer merges a duplicate into the report it duplicates. The duplicate's reporter
still learns what happened, without seeing anyone else's report.

**Why this priority**: Duplicates are the common case in a genuinely multi-user system, and
merging them is where D1's privacy requirement is easiest to violate.

**Independent test**: Merge one reporter's report into another's; confirm the first reporter
sees a status and nothing else about the target.

**Acceptance scenarios**:

1. **Given** two reports describing one problem, **When** the maintainer merges one into the
   other, **Then** the merged item becomes terminal and names its target internally.
2. **Given** a merged report, **When** its reporter views it, **Then** they see the target's
   **status only** — never its title, text, or reporter.
3. **Given** a merged item, **When** any transition other than viewing is attempted, **Then**
   it is refused.

---

### User Story 7 - Work survives an erased account (Priority: P7)

A reporter erases their account. The work their report started continues, no longer attached
to them.

**Why this priority**: `011` FR-AD-018 left this open; D15 settles it. Without it, erasure
either destroys unrelated work or silently orphans it.

**Independent test**: Erase a reporter's account and confirm their in-flight lifecycle item
still exists, still advances, and no longer carries reporter-identifying content.

**Acceptance scenarios**:

1. **Given** an in-flight item whose reporter erases their account, **When** the erasure
   completes, **Then** the item persists and remains advanceable.
2. **Given** such an item, **When** it is viewed, **Then** it carries no reporter-identifying
   content.
3. **Given** such an item, **When** the maintainer closes it, **Then** closure succeeds with no
   reporter to notify.

---

### Edge Cases

- A record is dismissed and an identical one arrives later — the new report is independent and
  may be accepted on its merits.
- A maintainer dismisses a report they themselves submitted — permitted; the acting
  administrator is still recorded.
- The release list is empty (no published releases) — closure falls back to free text exactly
  as it does when the list is unreachable.
- Two maintainers act on one item concurrently — one transition wins; the other is refused as
  an illegal transition rather than silently overwriting.
- A reporter deletes a report that has already entered an active stage — refused while active,
  consistent with `003` FR-F-020.
- Clause drafting returns nothing usable — the maintainer writes the clauses; drafting is an
  assist, never a precondition.
- An item is parked at `briefed` with clauses part-vetted — vetting state survives the park and
  is still required on reopen.

---

## Requirements *(mandatory)*

Written in EARS (D16). Patterns used: ubiquitous *The system shall…*; event-driven *When
\<trigger\>, the system shall…*; state-driven *While \<state\>, the system shall…*; unwanted
behaviour *If \<trigger\>, then the system shall…*; optional *Where \<feature\>, the system
shall…*

**Atomicity is the point, not the syntax.** Today's requirements bundle several behaviours
into one identifier — `003` FR-F-019 carries four — so "implemented" can be partly true. That
is structurally how three stale maintainer controls shipped. One trigger, one response, one
requirement, one test, matching the repo convention of naming the requirement in the test name.

### Functional Requirements

#### The stage model

- **FR-FL-001**: The system shall represent each accepted report as a **lifecycle item** whose
  stage is exactly one of `new`, `accepted`, `briefed`, `in-spec`, `in-progress`, `in-review`,
  `shipped`, `closed`, `dismissed`, `parked`, `merged`.
- **FR-FL-002**: The system shall treat `closed`, `dismissed` and `merged` as terminal stages.
- **FR-FL-003**: When a transition is requested that is not legal from the item's current
  stage, then the system shall refuse it and leave the stage unchanged.
- **FR-FL-004**: If two transitions are requested concurrently for one item, then the system
  shall apply at most one and refuse the other.
- **FR-FL-005**: The system shall record, for every applied transition, the originating stage,
  the resulting stage, the actor, and the time.
- **FR-FL-006**: While an item is in an active stage, the system shall refuse deletion of the
  feedback record it originated from.
- **FR-FL-007**: The system shall never move an item backward through the ordinal stages except
  by the explicitly defined park/reopen and gate-2-rejection routes.

#### The three gates

- **FR-FL-008**: When the maintainer accepts a report at gate 1, the system shall move the item
  from `new` to `accepted`.
- **FR-FL-009**: When the maintainer approves the specification at gate 2, the system shall
  move the item from `in-spec` to `in-progress`.
- **FR-FL-010**: When the maintainer approves the release at gate 3, the system shall move the
  item from `in-review` to `shipped`.
- **FR-FL-011**: The system shall require an explicit maintainer action for every stage
  change; no stage shall be derived from record content, repository state, or elapsed time.
- **FR-FL-012**: The system shall record which administrator gave each gate approval.
- **FR-FL-013**: The system shall derive gate-approval status on the server; a client shall not
  be able to assert that a gate was approved.
- **FR-FL-014**: When the specification is rejected at gate 2, the system shall return the item
  to `briefed` with its clauses intact.
- **FR-FL-015**: If a gate approval is requested from a stage that gate does not govern, then
  the system shall refuse it.

#### Triage capabilities

- **FR-FL-016**: When the maintainer dismisses a report, the system shall require a reason of
  either `no-action-required` or `declined`.
- **FR-FL-017**: The system shall store the dismissal reason and shall keep the two reasons
  distinguishable.
- **FR-FL-018**: When the maintainer merges one report into another, the system shall move the
  merged item to `merged` and record its target.
- **FR-FL-019**: While an item is `merged`, the system shall expose to its reporter the
  target's **status only**, and shall not expose the target's title, text, or reporter.
- **FR-FL-020**: Where a record has not yet been briefed, the maintainer shall be able to edit
  its structured fields.
- **FR-FL-021**: When a maintainer edits a record, the system shall attribute the edit to that
  maintainer.
- **FR-FL-022**: The system shall allow the maintainer to order the triage queue by priority.
- **FR-FL-023**: The system shall present the triage queue across all reporters.

#### Drafting and vetting at `briefed`

- **FR-FL-024**: When an item enters `briefed`, the system shall draft candidate EARS clauses
  from the record's content.
- **FR-FL-025**: The system shall display each drafted clause beside the record text it was
  derived from.
- **FR-FL-026**: The system shall mark any clause element not stated in the record as inferred.
- **FR-FL-027**: The system shall assign provisional identifiers to drafted clauses and shall
  not assign real requirement numbers to them.
- **FR-FL-028**: While any clause of an item is unvetted, the system shall refuse advancement
  to `in-spec`.
- **FR-FL-029**: The system shall allow the maintainer to accept, edit, or reject each clause
  individually.
- **FR-FL-030**: The system shall treat drafted clauses as a proposal with no authority; a
  clause shall take effect only once the maintainer has vetted it.
- **FR-FL-031**: If clause drafting produces nothing usable, then the system shall still allow
  the maintainer to author clauses manually.
- **FR-FL-032**: When the maintainer assembles a brief, the system shall include the vetted
  clauses in it.
- **FR-FL-033**: The system shall produce the brief as content a human runs; the system shall
  not execute it.

#### Reporter visibility

- **FR-FL-034**: The system shall show a reporter the current stage of each report they
  submitted.
- **FR-FL-035**: The system shall express stage to reporters in reporter-facing language.
- **FR-FL-036**: The system shall allow the maintainer to write a reply addressed to the
  reporter.
- **FR-FL-037**: When a maintainer reply exists, the system shall show it to that reporter
  attributed to the maintainer.
- **FR-FL-038**: The system shall not expose any report to a user other than its reporter and
  the maintainer.
- **FR-FL-039**: The system shall not notify reporters by any channel outside the application
  in this increment.

#### Closure

- **FR-FL-040**: The system shall permit closure only from `shipped`.
- **FR-FL-041**: When the maintainer opens closure, the system shall pre-fill the excerpt from
  the reporter's own title and problem statement.
- **FR-FL-042**: The system shall require the maintainer to confirm or rewrite the excerpt
  before closing.
- **FR-FL-043**: The system shall offer a release chosen from the repository's published
  releases.
- **FR-FL-044**: If the release list is unavailable, then the system shall allow closure with
  free text and shall state why the list was unavailable.
- **FR-FL-045**: The system shall never block closure on the availability of a third party.
- **FR-FL-046**: The system shall cache the release list.
- **FR-FL-047**: The system shall report the release-list dependency in the readiness check
  alongside the database and the agents.
- **FR-FL-048**: When an item is closed, the system shall show the reporter the excerpt and the
  release reference.
- **FR-FL-049**: If any transition out of `closed` is requested, then the system shall refuse
  it.
- **FR-FL-050**: Where a later report concerns a closed item, the system shall allow that
  report to cite the closed item as a reference only.
- **FR-FL-051**: The system shall not treat a citation as a transition of the cited item.

#### Surfaces and authorization

- **FR-FL-052**: The system shall present one reporter surface and one maintainer surface.
- **FR-FL-053**: The system shall not render maintainer controls on the reporter surface.
- **FR-FL-054**: The system shall enforce every maintainer capability on the server
  independently of whether any surface exposes it.
- **FR-FL-055**: If an authenticated non-maintainer requests a maintainer capability, then the
  system shall refuse it distinguishably from an authentication failure and shall change no
  state.
- **FR-FL-056**: The system shall carry triage and delivery on the same maintainer surface.

#### Invariants inherited and restated

- **FR-FL-057**: The system shall not commit, merge, tag, or deploy as part of any transition.
- **FR-FL-058**: The system shall treat all report text as untrusted data and never as
  instruction.
- **FR-FL-059**: When a reporter's account is erased, the system shall retain their in-flight
  lifecycle items.
- **FR-FL-060**: When a reporter's account is erased, the system shall detach their lifecycle
  items from reporter-identifying content.
- **FR-FL-061**: While an item is detached from an erased reporter, the system shall keep it
  advanceable and closable.

### Key Entities

- **LifecycleItem** — the unit of work created when a report is accepted. Carries the stage, an
  immutable snapshot of the source report taken at acceptance, the ordered transition log, the
  dismissal reason where applicable, the merge target where applicable, the vetted clauses, the
  maintainer reply, and the closure record. Survives its reporter (FR-FL-059).
- **Clause** — a drafted or maintainer-authored EARS statement attached to an item at
  `briefed`, carrying its provisional identifier, the record text it derives from, whether any
  element is inferred, and its vetting state.
- **ClosureRecord** — the excerpt and the release reference, plus whether the release was
  chosen from the list or entered as fallback free text.
- **Reply** — maintainer-written text addressed to one reporter, attributed and timestamped.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-FL-001**: Every report reaches a recorded terminal stage — `closed`, `dismissed`, or
  `merged` — rather than being left without a decision.
- **SC-FL-002**: A reporter can determine the state of every report they have submitted without
  contacting the maintainer.
- **SC-FL-003**: No reporter can observe any part of another reporter's report, including
  through a merge.
- **SC-FL-004**: Every stage change in the system is attributable to a named administrator and
  an explicit action. *(Restates `003` SC-F-007 honestly: tracking is hand-advanced by
  decision D4, not automatic.)*
- **SC-FL-005**: No item reaches `in-spec` with an unvetted clause.
- **SC-FL-006**: `shipped` is reachable only through a recorded release approval.
- **SC-FL-007**: No lifecycle action performs a repository write of any kind.
- **SC-FL-008**: Closure succeeds when the release list is unavailable.
- **SC-FL-009**: No maintainer control is reachable by a non-maintainer, in the surface or on
  the server.
- **SC-FL-010**: An erased reporter's in-flight work remains advanceable and carries no
  identifying content.

---

## Assumptions

- One administrator tier, as established by `011`; graded roles remain a later refinement.
- The repository whose releases populate the picker is public-readable, so the release list
  needs no credential. Were it made private, this becomes a token-holding integration and the
  assumption must be revisited.
- Reporters are authenticated; anonymous reporting is not in scope.
- The capture conversation of `003` is unchanged (D2), including its turn cap and forced
  finalize, on which D18 now depends.

---

## Dependencies

- **`003` Conversational Feedback Capture** — produces the records this lifecycle consumes,
  and owns the forced-finalize path D18 relies on.
- **`011` Administration Capabilities** — owns the administrator role, verified-claim
  sourcing, the refusal semantics restated in FR-FL-055, and the audit trail that carries
  FR-FL-005.
- **`002` Authentication** — identity for reporter isolation and attribution.
- The repository's published releases, read-only, for FR-FL-043.

---

## Out of scope

- Any in-app execution of development work: no job runner, no scheduler, no agent holding
  repository credentials (D3).
- GitHub integration driving stage movement; the release picker is read-only and drives
  nothing (D4/D17).
- Notifications outside the application — email, push, or chat (D6).
- Reopening closed items; a recurrence is a new report that cites the old one (D13).
- Graded administrator roles beyond the single tier `011` established.
- Retro-converting the requirement sections of already-shipped specs to EARS (§5 bounds).
- Changes to the capture conversation itself (D2).
