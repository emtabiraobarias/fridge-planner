# Acceptance-Scenario Checklist (shared)

> **Shared, canonical, one list.** Derived from `spec.md` (the *what*). Both implementations
> (`impl/vite`, `impl/nextjs`) are verified against **this same** list — scenarios are spec-level,
> so they are not duplicated per branch.
>
> **How to use (Phase B/C):** on each running branch, walk these scenarios against the live app.
> Record per-branch **pass/fail and bugs** in that branch's `verification-findings.md` — reference
> the **stable IDs** below (e.g. `US1-S4`, `EC-08`, `SC-014`) rather than re-typing scenario text.
>
> **Routing:** a failure that violates one of these (an existing FR/scenario) is a **bug** → fix on
> the branch where it occurs (and check the other branch). A gap with **no** covering scenario/FR is
> a **spec-gap** → fix in `spec.md` on `main`; add the new scenario here; both impls inherit on sync.
>
> Keep this in lockstep with `spec.md`. If a scenario here drifts from `spec.md`, `spec.md` wins.

## US1 — Inventory Tracking & AI Meal Recommendations (P1)

- **US1-S1** — Empty inventory → add ingredients → saved with accurate quantities + categories.
- **US1-S2** — 5+ items → request recommendations → AI returns 3–5 meals primarily using existing ingredients.
- **US1-S3** — View a recommended meal → owned ingredients are marked separately from to-purchase ones.
- **US1-S4** — Perishables nearing expiry → recommendations prioritize soon-to-expire ingredients.
- *(US1-S5 removed in spec — intentionally skipped; do not renumber.)*
- **US1-S6** — Use an ingredient in a planned meal → inventory quantities update to reflect consumption. ☑ **Verified 2026-06-20** (BUG #7, `7dca07a`) — reversible: removing/replacing a meal restores quantities (FR-005).
- **US1-S7** — Ingredient expiring tomorrow (before midnight) → highlighted **yellow** with indicator.
- **US1-S8** — Ingredient expired today or earlier (midnight cutoff) → highlighted **red**, interaction disabled.
- **US1-S9** — Expired items present → LLM agent does **not** receive expired items as available.
- **US1-S10** — Click an expired item to add to a meal plan → action prevented + "expired" message.
- **US1-S11** — Recommended meal needs an owned-but-expired ingredient → it appears on the grocery list as new-to-buy.

## US2 — Weekly Meal Planning, Drag-and-Drop Calendar (P2)

- **US2-S1** — View weekly calendar → 7-day grid with breakfast/lunch/dinner slots per day.
- **US2-S2** — Drag a meal card to a day/meal slot → meal assigned there, card visually moves.
- **US2-S3** — Drag a planned meal (Tue dinner → Fri lunch) → meal moves, ingredient calcs update.
- **US2-S4** — Multiple meals planned → calendar shows all, organized by day + meal type.
- **US2-S5** — Remove/delete a planned meal → removed from calendar, returns to available recommendations.
- **US2-S6** — Calendar overview → fully-planned days are distinguishable from days still needing meals.

## US3 — Smart Grocery List with Aggregation (P3)

- **US3-S1** — 3 meals each needing 1 onion → grocery list shows "Onions: 3 total" as one line.
- **US3-S2** — 3 meals each requiring milk → one aggregated line item "Milk ×3" (servings count). *(Quantity/unit normalization deferred — FR-028.)*
- **US3-S3** — Meals require eggs and inventory has eggs → eggs appear as a needed line item. *(Net deduction "4 (6−2)" deferred — FR-027.)*
- **US3-S4** — Grocery list grouped by category (Produce, Dairy, Meat, Pantry, …).
- **US3-S5** — Check off an item → marked purchased, crossed out / moved to completed.
- **US3-S6** — Confirm purchased items → added to inventory with purchased quantities.
- **US3-S7** — 15+ item list → filter by category or search to find items quickly.

## Edge Cases

- **EC-01** — Empty inventory on recommend → suggests popular recipes + prompts to add items. ☑ **Verified 2026-06-19** (BUG #5, `3cc068d`) — returns `POPULAR_RECIPES` + `fallback:'popular'`.
- **EC-02** — Insufficient ingredients (e.g. only condiments) → recommends minimal-addition recipes.
- **EC-03** — Duplicate ingredient added with different quantities → prompt to merge / choose. ☑ **Verified 2026-06-21** (BUG #2, `abf3088`) — same-name add prompts Merge / Add separately / Cancel.
- **EC-04** — Expired items present → red-flagged + excluded from LLM input.
- **EC-05** — Fresh + expired versions of same ingredient → distinguished; only non-expired counted.
- **EC-06** — Ambiguous units on aggregation ("1 large onion" + "200g") → conservative estimate + flag for review.
- **EC-07** — Same meal planned twice in one day → allowed, with a confirmation prompt.
- **EC-08** — LLM service down/timeout → fallback to cached/popular recipes. ☑ **Verified 2026-06-19** (BUG #4/SC-010, `3cc068d`) — agent failure → 200 with stale-cache→popular fallback.
- **EC-09** — Offline → show cached plans + lists with a "new recommendations need connectivity" notice.
- **EC-10** — Concurrent editing across devices → sync changes, refresh recommendations.
- **EC-11** — Missing expiration dates → shown as normal (no highlight), included in recommendations.

## Measurable Success Criteria (SC)

Verify where observable in-app; survey/ops-only criteria are noted.

- **SC-001** — Add 10 inventory items in < 3 min.
- **SC-002** — Immediate non-blocking feedback (<1s loading state); async delivery. Cached <5s; cold/web-researched delivered when ready (target <3 min), 95%+ success (inventory has ≥1 non-expired item). Async-exempt from CR-008. ☑ **Verified 2026-06-22** (SG-02, `9a2c33e`) — client shows immediate `Thinking…`/skeletons + a fallback notice; meals render when ready.
- **SC-003** — 80% of recommended meals use ≥60% of current non-expired inventory.
- **SC-004** — Plan 21 meals (full week) in < 10 min via drag-and-drop.
- **SC-005** — 100% **grouping** accuracy (every occurrence of an ingredient → one line item with accurate servings count). *(Quantity/unit-conversion accuracy deferred — FR-028.)*
- **SC-006** — First full workflow (inventory → recommend → plan → grocery) in < 15 min.
- **SC-007** — Loads + interactive in < 3s on 3G.
- **SC-008** — 90% plan ≥1 meal on first visit without help docs. *(usability)*
- **SC-009** — ≥20% food-waste reduction. *(survey, 4-week)*
- **SC-010** — 99.5% recommendation-API uptime with graceful degradation. *(ops)*
- **SC-011** — No layout breakage at 320 / 768 / 1920px.
- **SC-012** — Previously planned meals + lists accessible within 2s on return.
- **SC-013** — 95% of users identify expiring/expired items within 2s. *(usability)*
- **SC-014** — Expired items excluded from LLM 100% of the time (food-safety). *(overlaps US1-S9, EC-04)* ☑ **Verified 2026-06-19** — exclusion is **date-derived** (`notExpiredQuery()`), robust to stale stored status (BUG #6 fixed: `impl/vite` `95afbe5` → `impl/nextjs` `41e9881`).

## Cross-cutting requirements

- **FR-036** (per-user data isolation) — a user cannot read, modify, or delete another user's inventory / meal-plans / grocery lists, and the recommendation agent receives only the requester's ingredients. ☑ **Verified 2026-06-11** — `packages/server/tests/integration/isolation.test.ts` (5 cases, both impls; BUG #1 fixed: `impl/vite` `29d2e89` → cherry-pick `impl/nextjs` `532e198`).

## Authentication (002 / Phase D — shared)

> Spec `002` (OAuth 2.0 / OIDC). Topology-agnostic contract; enforcement is per-branch
> (`impl/nextjs` = Next server layer `authenticate()`; `impl/vite` = Express `authMiddleware`).
> Verified 2026-06-27 — `impl/nextjs` `3d0a3bb`/`69a415e`, `impl/vite` `40414d2`; both E2E gates 9/9.

- **AUTH-US1-S1** (FR-D-001/003) — a request with a **valid** Bearer token is served, identified by the token `sub`; data is scoped to that user. ☑ **Verified** — handler/integration auth tests (oidc mode).
- **AUTH-US1-S2** — a **brand-new** subject's first call returns an empty, successful result (no error). ☑ covered by scoping tests.
- **AUTH-US2-S1** (FR-D-005, SC-D-001) — **missing / malformed / expired / bad-signature / wrong-iss / wrong-aud** token → `401` RFC-7807 Problem JSON, no data. ☑ **Verified** — verifier unit tests (7 cases) + handler 401 tests.
- **AUTH-US2-S2** (FR-D-006) — the public **health** endpoint is reachable with no token. ☑ **Verified** — `/api/health` (nextjs) / `/health` (vite).
- **AUTH-US3-S1** (FR-D-004 / FR-036, SC-D-002) — an authenticated user cannot reach another user's resource by id → `404` (existence not revealed), across **inventory + meal-plans + grocery-lists**. ☑ **Verified** — cross-user 404 tests on both impls.
- **AUTH-EC-1** — expired token → `401` (distinct from other failures, with clock-skew leeway); **JWKS key rotation** (unknown `kid`) triggers refetch. ☑ **Verified** — verifier edge tests.
- **AUTH-EC-2** (FR-D-007/008) — the `dev` seam (`X-User-Id`) is **refused in production** unless explicitly acknowledged; production uses OIDC only. ☑ **Verified** — prod-guard unit test.
- **AUTH-UX-1** (FR-D-009) — the client surfaces a `401` as a **(re-)authentication prompt**, not a generic error. ☑ **Verified** — `AuthBanner` tests (both clients).
- **AUTH-UX-2** (FR-D-010) — an expired access token is renewed **transparently** (refresh grant, single-flight, one-shot retry — no user interaction, no state loss); the FR-D-009 prompt fires only when renewal fails; IdP sessions allow ≥12h idle. ☑ **Verified `impl/nextjs` 2026-07-16** (4-case refresh suite; shipped 4.2.1; Keycloak realm set to 12h) · ☐ **`impl/vite` DEFERRED by decision**.

> **Success criteria:** SC-D-001 (100% no-token → 401, zero leak) ☑ · SC-D-002 (own-data-only, cross-user 404 all resource types) ☑ · SC-D-003 (JWKS cached, within CR-008) — design-satisfied (no perf-test) · SC-D-004 (suite green with no IdP via dev seam) ☑.
> **Out of scope (002):** token issuance, login UI, IdP configuration.

## 2026-07 increment — recipe links, calendar interactions, inventory edit (shared)

> Spec deltas of 2026-07-15/16 on `main`: FR-014 (5-10 net), FR-037 (verified recipe links,
> async-lazy + settle-to-linked), spec 004 FR-UI-019 revision (scoped inventory edit), and
> FR-022/FR-024 enforcement. `impl/nextjs` shipped all of it to prod (app 4.2.1, 2026-07-16);
> **`impl/vite` is DEFERRED by decision** and owes the items marked ☐ on its next pass.

- **US1-S12** (FR-015 / FR-037) — recommendations display immediately; each meal's **verified** recipe link appears shortly after (async verify-links phase); once settled, every remaining meal links to a real recipe page (unlinked meals removed). ☑ **`impl/nextjs`** (controller/context/e2e suites + live gate 13/13) · ☐ **`impl/vite` DEFERRED** — needs the verify-links endpoint + client lazy phase.
- **US1-S13** (FR-037) — verification unavailable → clear notice; no unlinked meal remains displayed. ☑ **`impl/nextjs`** · ☐ **`impl/vite` DEFERRED**.
- **CAL-1** (FR-022) — a planned meal can be **dragged** to a different slot and persists there (FR-023). ☑ **`impl/nextjs`** (`calendar-dnd.e2e.ts`; restored after the 004 redesign dropped it) · ◐ **`impl/vite`: likely already satisfied** (pre-redesign calendar kept DnD) — re-verify on the next vite pass.
- **CAL-2** (FR-024) — clicking a planned meal opens the details modal incl. the recipe link (new tab). ☑ **`impl/nextjs`** · ◐ **`impl/vite`: likely already satisfied** — re-verify.
- **INV-EDIT-1** (FR-002 / 004 FR-UI-019R) — an item's **expiry** (settable + clearable → status `none`) and **location** are updatable from the list. ☑ **`impl/nextjs`** (EditItemSheet + PUT `expiresAt:null` → `$unset`, hook-derived status) · ☐ **`impl/vite` DEFERRED** — ⚠ the **clear-expiry API contract** (`expiresAt:null`) is a *backend* delta: vite's Express server owes the `$unset` + status-recompute path even before any UI work.
