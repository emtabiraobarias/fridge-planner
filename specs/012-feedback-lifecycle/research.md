# Research — 012 Feedback Lifecycle (`impl/nextjs`)

Phase 0 output. Resolves the unknowns in `plan.md` → Technical Context. Each entry records the
decision, why, and what else was considered. **D7 remains deliberately unresolved** — see R8.

---

## R1 — Does the lifecycle get a new collection, or evolve `pipeline_items`?

**Decision: evolve `pipeline_items` in place.** Rename the model `PipelineItem` → `LifecycleItem`
(same collection), widen the stage enum, add the new fields, and run a one-time stage migration.

**Rationale.** The old and new stage sets are not disjoint — they nest almost perfectly:

| `003` stage | `012` stage | Migration |
|---|---|---|
| `approved` | `accepted` | rename |
| `in-spec` | `in-spec` | unchanged |
| `in-review` | `in-review` | unchanged |
| `shipped` | `shipped` | unchanged |
| `parked` | `parked` | unchanged |
| — | `new`, `briefed`, `in-progress`, `closed`, `dismissed`, `merged` | net-new |

Only one value actually changes. A second collection would mean dual-write, a join on every
maintainer view, and two sources of truth for "what stage is this in" — all to avoid a single
`updateMany({stage:'approved'},{$set:{stage:'accepted'}})`. The `{userId,stage}` and
`{userId,updatedAt:-1}` indexes carry over unchanged.

**Alternatives considered.** (a) New `lifecycle_items` collection with backfill — rejected: the
migration is trivial, so the cost buys nothing. (b) Keep `PipelineItem` and add a sibling
`LifecycleState` document — rejected: splits an entity that has one lifecycle.

**Carries a required follow-up:** `lib/account-purge.ts` names this collection. See R4.

---

## R2 — When is a lifecycle item created?

**Decision: at `complete`, in stage `new`.** Gate 1 (`FR-FL-008`) then moves `new → accepted`.

**Rationale.** `FR-FL-001` says the system represents "each **accepted** report" as a lifecycle
item, but the same requirement lists `new` among the legal stages, and the stage diagram opens
with `new ──accept(GATE 1)──▶ accepted`. Those only reconcile if the item exists *before*
acceptance. Creating it when the record reaches `complete` also gives the triage queue
(`FR-FL-023`) something to list — otherwise nothing is queryable until after the decision that
the queue exists to support.

> **Spec wording to tighten during `/speckit.analyze`:** `FR-FL-001`'s "each accepted report"
> should read "each completed report", or `new` should be described as pre-item. This is an
> editorial ambiguity, not a design change — recorded rather than silently interpreted.

**Alternatives considered.** Create at acceptance and model `new` as "record exists, no item" —
rejected: it makes the queue query span two collections and leaves dismissal-before-acceptance
(`FR-FL-016` permits dismissing from `new`) with nowhere to record its reason.

---

## R3 — Where does EARS clause drafting run?

**Decision: a second mode on the existing `feedback-collector` agent.** No third Holodeck
container.

**Rationale.** The handoff's plan-level note prefers this, and the reason is sound: the
untrusted-data framing already lives in that agent (`FR-F-011`), and clause drafting consumes
exactly the same untrusted report text. A third container would duplicate that framing, add a
third `*_AGENT_URL`, a third image, a third pin in `docker-compose.prod.yml`, and a third
readiness probe — for one call per item.

**Shape.** A distinct prompt path selected by request, returning
`{status:'clauses', clauses:[{text, derivedFrom, inferred}]}` — a third member of the existing
Zod discriminated union in `services/feedback-collector.ts`, so the fence-strip and parse path is
reused. Requires an `agent-feedback-v*` release before the app depends on it, and the app must
tolerate an agent that does not yet know the mode (fail to "no clauses drafted", which
`FR-FL-031` already requires as a first-class path).

**Alternatives considered.** (a) Third container — rejected above. (b) Draft clauses in-process
with a template, no LLM — rejected: `FR-FL-024` says *derive from the record's content*, which is
a language task; but note this remains the graceful-degradation path under `FR-FL-031`.

---

## R4 — Erasure must detach, not delete ⚠️ **conflicts with shipped code**

**Decision: remove the lifecycle collection from the purge delete-list and add an explicit detach
step.**

**The conflict.** `src/server/lib/account-purge.ts` today:

```ts
export const USER_KEYED_MODELS = [ …, { name: 'pipeline-item', model: PipelineItem } ];
// purgeUserData(): for each → model.deleteMany({ userId })
```

Erasing a reporter **deletes their pipeline items**. `FR-FL-059`..`FR-FL-061` (D15) require the
opposite: the item survives, detached from reporter-identifying content, and stays advanceable
and closable. `011` `FR-AD-018` also demands purge leave no orphans — D15 resolves that by making
detachment the *defined* outcome rather than an orphan.

**Design.** Split the purge into two lists:

- `USER_KEYED_MODELS` — delete (inventory-item, meal-plan, grocery-list, ingredient-alias,
  feedback-record).
- `USER_DETACHED_MODELS` — new: lifecycle-item. Purge clears `userId` → a sentinel, clears the
  denormalised `sourceTitle`/reporter fields, and sets `reporterErasedAt`.

⚠️ **CLAUDE.md §5 states "adding a seventh means adding a line there, or erasure silently orphans
it."** That rule now has two lists, and the guidance must be updated in the same PR or the next
model added will be filed under the wrong semantics.

**Alternatives considered.** Keep deleting and accept the loss — rejected, contradicts D15 and
destroys unrelated maintainer work. Anonymise by rewriting `userId` to a hash — rejected: a hash
is still a per-user key, so it re-identifies across collections.

---

## R5 — How is a merged reporter shown "status only"?

**Decision: a server-side projection, never a client-side filter.**

`FR-FL-019` says a merged item exposes the target's **status only** — not its title, text, or
reporter. The reporter-facing read therefore resolves `mergedInto`, fetches the target's `stage`
alone, and returns `{stage}`. The target document never leaves the server.

**Rationale.** D1 makes reporter isolation a first-class requirement, and the cheapest way to
violate it is to send the whole target and hide fields in the UI. `SC-FL-003` is asserted in
tests against the API response, not the rendered output.

---

## R6 — Which surfaces, and where do the existing controls go?

**Decision: reporter surface stays at `/feedback`; maintainer surface is `/admin`.**

`FR-FL-052`/`FR-FL-056` require one reporter surface and one maintainer surface carrying triage
*and* delivery. `/admin` already exists (spec 011) with `FeedbackTriageList`, and already carries
the tab layout that `OpsPanel`/`AccountsPanel`/`SettingsPanel` use — delivery becomes another tab.

**Consequence.** `PipelineStatusView` moves off `/feedback` in its acting form: reporters keep a
**read-only** stage display (`FR-FL-034`, and `GET /pipeline` is not admin-guarded), while the
transition controls live only on `/admin`. PR #76 already gated those controls behind
`useIsAdmin`; this completes it structurally so the gate is no longer the only thing standing
between a reporter and a 403.

**Note:** `FR-FL-053` says maintainer controls are not *rendered* on the reporter surface, and
`FR-FL-054` says enforcement is server-side regardless. Both, not either.

---

## R7 — GitHub release list (D17) — the first outbound dependency

**Decision: unauthenticated `GET /repos/{owner}/{repo}/releases`, cached in-process, 1-hour TTL,
never blocking.**

- **Cache**: the same module-level pattern as `services/recommendations-cache.ts`. Releases change
  rarely and the unauthenticated rate limit is 60 req/hr/IP, so a 1h TTL keeps a single-node
  deployment far inside it.
- **Degrade, never block** (`FR-FL-044`/`FR-FL-045`): on any failure the closure form falls back
  to free text **and states why**. Closure must never be gated on a third party.
- **Readiness** (`FR-FL-047`): a fourth probe in `lib/health-checks.ts`, alongside mongodb, the
  two agents, and recipe-providers. It reports `degraded`, never `down` — an unreachable release
  list does not make the app unready.
- **Config**: `GITHUB_REPO` (`owner/name`), no credential. If the repo ever goes private this
  becomes a token-holding integration and the spec Assumption must be revisited.

**Alternatives considered.** Persist releases in Mongo — rejected: adds a collection and a
staleness problem for data that is a display convenience. Ship a token now — rejected: the repo is
public-readable, and an unnecessary credential is a liability.

---

## R8 — D18 modal placement ✅ **RESOLVED 2026-08-24**

**Decision: ask in the capture modal, before the note is sent.** The reporter decides while still
typing, so nothing is added to the wait and the branch is known before the request leaves.

**Rationale — decided on evidence from the tree, not preference.** The alternative (send first,
ask only if the assistant returned a question) asks strictly fewer unnecessary questions, but
charges an agent round-trip on *every* capture before the reporter learns whether they are done —
the exact latency quick capture exists to avoid. Three facts make its benefit close to
hypothetical:

- `agents/feedback-collector/instructions/system-prompt.md` **mandates** exactly one clarifying
  question whenever detail is still missing.
- The agent is tuned to produce records usable *"verbatim as specification input"*, so a one-line
  quick note essentially never clears that bar on the first turn.
- `003`'s 2026-07-28 revision records that the assistant **"almost always answers a first message
  with a clarifying question"**, reproduced live 2026-07-27.

So it would have asked nearly every time regardless, after a wait bounded by the 60s agent timeout.

**Alternatives considered.** (b) send-first, above — rejected. (c) fire the request and show the
question concurrently, dropping it if the assistant finishes first — rejected: the modal can
change under the reporter mid-answer, the same "control appears then vanishes" defect PR #76 had
just removed, and it introduces a race for no gain in the common case.

**Implementation consequence.** `FR-F-019` now pins placement, not just behaviour: the ask happens
in the modal before sending, and the reporter must never wait on an assistant turn to learn
whether they are done. `003` `tasks.md` **T020 is unblocked**.

---

## R9 — Reuse, not reinvention

Confirmed available and intended for reuse:

| Need | Existing |
|---|---|
| Atomic guarded transition | `findOneAndUpdate` pattern in `controllers/pipeline.ts` (`FR-FL-003`/`FR-FL-004`) |
| Admin refusal (403 not 401) | `requirePrincipalAdmin` in `server/admin-guard.ts` |
| Audit of who did what | `lib/audit.ts` `record()` — append-only, TTL 90d |
| Untrusted-text framing | `services/feedback-collector.ts` transcript markers |
| Problem JSON | `server/http.ts` `problem()` |
| Rate limiting | `server/rate-limit.ts` |
| Brief rendering | `lib/feedback-export.ts` — extend to carry vetted clauses (R3) |

Nothing here needs a new dependency. **No new npm package is required by this plan.**
