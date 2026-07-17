# Research — Intelligent Quick-Add Understanding (`impl/nextjs`)

Phase 0 output. All Technical Context unknowns resolved; decisions numbered for traceability from plan/tasks.

## D1 — Parser evolution strategy: extend the pure client lib, don't replace it

**Decision**: Extend `packages/client/src/lib/quick-parse.ts` in place — per-clause extractors (`extractLocation`, extended `extractExpiry`/`extractQuantity`) composed by `parseQuick`, plus a new `parseQuickAll(text): ParsedQuickItem[]` for multi-item input. The result type gains per-field provenance (see D2). Existing helper exports (`daysLeft`, `expiryText`, `stepFor`, …) are untouched.

**Rationale**: FR-IQ-008 requires an instantaneous, network-free deterministic result; the lib is already pure, injected-`TODAY` testable, and shared by both entry points (FR-IQ-007). Per-clause extractors keep each function under the complexity-10 limit.

**Alternatives considered**: (a) a grammar/tokenizer library (chrono-node etc.) — rejected: new dependency for a narrow vocabulary, harder to keep byte-identical with the spec-004 reference pseudocode; (b) moving parsing server-side — rejected: breaks the as-you-type preview and FR-IQ-008.

## D2 — Provenance representation

**Decision**: `ParsedQuickItem` = existing fields + `provenance: { quantity, unit, category, location, expiresAt } → 'explicit' | 'learned' | 'assisted' | 'guess'`. `parseQuick` emits only `explicit`/`guess`; the alias layer (IQ3) and assist layer (IQ4) upgrade `guess` fields to `learned`/`assisted` in the client merge step, never downgrading `explicit`.

**Rationale**: the spec fixes a per-field precedence (explicit > learned > assisted > guess); encoding provenance in the parse result makes precedence enforcement and chip styling the same mechanism (FR-IQ-011/016/020).

**Alternatives considered**: a parallel "confidence score" float — rejected: the spec's model is categorical, not scalar; four named sources are simpler to test.

## D3 — Correction-override merge semantics (FR-IQ-014)

**Decision**: chip corrections live in component state as `overrides: Partial<fields>` per item, each recording the parsed value it replaced. On re-parse: an override is **kept** while the fresh parse still yields the same value it originally replaced for that field, and **dropped** when the fresh parse's value for that field changed (the user's new text now speaks for that field). Overridden fields render as `explicit` (user-stated).

**Item identity in multi-item input**: overrides are keyed by the item's parsed `name` (case-insensitive, whitespace-collapsed), never by segment position — re-splitting the text (adding/removing commas) re-associates overrides by name, and an override whose name no longer matches any current segment is dropped with it.

**Rationale**: satisfies "survives re-parsing while the text still produces the same value" literally, with a single comparable per field — no diffing heuristics. Name-keying keeps an override attached to "its" item when segments shift, and makes the drop rule deterministic.

**Alternatives considered**: always keep overrides until submit — rejected: typing "…in the freezer" after correcting location to pantry would silently ignore the newer, explicit text; spec precedence says explicit text wins.

## D4 — Alias storage shape + shelf-life suggestion rule

**Decision**: one Mongo collection `ingredient_aliases` (model `src/server/models/ingredient-alias.ts`): `{ userId, nameKey (lowercased/trimmed), category?, location?, unit?, expiryObservations: number[] (FIFO-capped at 5), timestamps }`, unique compound index `(userId, nameKey)`. Corrections upsert the corrected field(s); adds that carry an expiry push `daysLeft(expiresAt)` as an observation. Suggestion = **median of observations, offered only when ≥2 observations exist**, applied only on tap (FR-IQ-017).

**Rationale**: exact-key lookup honours the spec assumption (alias keys on the name as typed) and §14's no-embeddings rule; a capped observation window adapts to changing habits without unbounded growth; median resists one-off outliers (a "use today" clearance buy). Collection name matches roadmap backlog #2's planned `ingredient_aliases` so the two features share one table later.

**Alternatives considered**: EWMA of shelf-life — rejected: harder to explain/test than a median over ≤5 values; storing suggestions on the InventoryItem — rejected: aliases outlive items and apply before an item exists.

## D5 — Alias transport + client caching

**Decision**: `GET /api/v1/quick-add/aliases` returns the user's full alias list (small; loaded once into a client context cache on first quick-add focus); `PUT /api/v1/quick-add/aliases/:nameKey` upserts `{ category?, location?, unit?, observedShelfLifeDays? }`. Both authenticated, Problem JSON, default 100/min rate limit. The client merges aliases at parse time locally — zero network on the typing path.

**Rationale**: keeps FR-IQ-008 (deterministic path network-free) while making learned data durable and per-user (FR-IQ-015/018). Full-list fetch beats per-name lookups: one round-trip, no typing-path latency.

**Alternatives considered**: per-keystroke server lookup — rejected (latency, chattiness); localStorage-only learning — rejected: not durable across devices and invisible to backlog #2's future server-side alias reuse.

## D6 — AI-assist mechanism (US4)

**Decision**: `POST /api/v1/quick-add/parse` `{ text }` → server service `parse-assist.ts` calls the **OpenAI Chat Completions REST API directly with `fetch`** (no SDK, no new dependency; same pattern as the existing agent client), model **`gpt-4o-mini`**, JSON-schema structured output; response zod-validated field-wise against the exact `Category`/`Location`/unit enums (invalid fields dropped per FR-IQ-020). In-memory TTL cache (1h) keyed by normalised text — same pattern as `recommendations-cache` / `verifyRecipeCached`. Rate limit 20/min per user. No `OPENAI_API_KEY` configured → 503 Problem JSON; the client treats 503/timeout/error identically: keep the deterministic result, show nothing (FR-IQ-021).

**Rationale**: the roadmap analysis already ruled this "a plain structured-output call — no Holodeck needed"; `gpt-4o-mini` is sufficient for enum classification at a fraction of `gpt-4o` cost (FR-IQ-022); field-wise zod gating makes a hallucinated category harmless.

**Alternatives considered**: a third Holodeck agent — rejected: a whole container/port for a one-shot classification is over-engineering (and Holodeck serves one agent per instance); Anthropic API — rejected: `OPENAI_API_KEY` is the repo's sole LLM credential by prior decision.

## D7 — Low-confidence trigger + client behaviour (US4)

**Decision**: the client requests assist only when, after deterministic parse + alias merge, `category === 'Other'` (fallback) **and** the text segment has a usable name. Debounced ~600ms after typing pauses; at most one in-flight request; result merged as `assisted` provenance for fields still at `guess`. Submitting while a request is in flight never waits for it.

**Rationale**: matches the spec's minimum trigger ("could not be categorised beyond the fallback"), keeps consultations rare (FR-IQ-022), and guarantees the add flow never blocks (SC-IQ-005).

**Alternatives considered**: assist on every parse — rejected on cost and latency; assist at submit time — rejected: the value is in improving the *preview* the user confirms.
