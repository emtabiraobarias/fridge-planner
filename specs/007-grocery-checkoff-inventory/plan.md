# Implementation Plan: Grocery Check-Off Flows Into Kitchen Inventory (`impl/nextjs`)

**Branch**: `007-implement` · **Date**: 2026-07-18 · **Spec**: [`spec.md`](spec.md)
**Input**: Feature specification from `specs/007-grocery-checkoff-inventory/spec.md`

> **Per-branch plan** (not on `main`). This is the `impl/nextjs` implementation plan for shared spec `007`, which amends spec 001 FR-031/FR-032. It mirrors spec 006's receipt-driven inventory lifecycle on the purchase side: buy -> inventory increases immediately, cook -> inventory decreases later.

## Summary

Close the shopping -> kitchen half of the loop in four independently testable increments matching the spec stories: **GC1** makes a grocery-line check-off an atomic purchase transition that adds or merges inventory immediately and stores a purchase receipt; **GC2** reverses that receipt exactly when a line is un-checked; **GC3** adds a quick prompt only for ambiguous servings-model lines, using spec 005 alias memory for learned units and optional expiry suggestions; **GC4** revises checkout so it marks remaining lines and skips receipted lines, never double-adding a mid-shop tick. **GC5** handles verification, e2e, and documentation cascade.

## Technical Context

**Language/Version**: TypeScript (strict) on Node 20 / React 18 / Next.js 15 App Router - one process on `:3000`
**Primary Dependencies**: existing only - Mongoose 8, Zod, Tailwind, `lucide-react`. **No new npm dependencies**.
**Storage**: MongoDB via Mongoose - extends the `grocery_lists.items` subdocument with `purchaseReceipt`; reuses `inventory_items` and spec 005 `ingredient_aliases` (`unit`, `expiryObservations`). No new collection.
**Testing**: Vitest - `tests/server/grocery-lists.test.ts` for handler-through-controller flows, `tests/server/unit/purchase-inventory.test.ts` for receipt semantics, RTL component/context/view tests for the prompt and toggle wiring; Playwright e2e for tick -> Kitchen -> un-tick.
**Target Platform**: existing web app (mobile-first, 320-1920px).
**Project Type**: web - single `packages/client` package (UI + Route Handlers + `src/server`).
**Performance Goals**: check-off and un-check complete in one API interaction; purchase add/merge/reverse uses bounded inventory queries and single-line receipt writes; checkout remains O(items).
**Constraints**: server modules start with `import 'server-only'`; extensionless `@server/*` imports; thin handlers over controllers; Problem JSON via `problem()`/`withRoute`; rate limit every handler; complexity <=10; no new state library; never set `expirationStatus` manually; stale recommendation cache invalidated on purchase add and reversal.
**Scale/Scope**: single-household lists; receipts are one small embedded object per grocery line; alias memory remains per-user and bounded by existing model behavior.

## Constitution Check

*Gate evaluated against root `constitution.md` (v3.1.0) + `CLAUDE.md` sections 7/8/14. Re-check after Phase 1 design: PASS.*

- **Strict typing / no `any` / explicit return types** PASS - purchase receipt, resolved purchase input, and prompt payload types live in server/client grocery-list types.
- **TDD** PASS - every story phase starts with failing tests citing FR-GC numbers before implementation tasks.
- **Coverage >=70% client** PASS - server purchase lib is unit-tested; grocery context/view and prompt sheet get RTL coverage; full suite remains the final gate.
- **Context + hooks only** PASS - grocery actions remain in `GroceryListContext`; prompt state is local to `GroceryListPage`/`PurchasePromptSheet`.
- **Mobile-first, WCAG 2.1 AA** PASS - prompt uses labelled numeric/date controls and >=44px targets; purchased state is conveyed by checkbox/icon/text, not color alone.
- **API-first, RFC 7807, versioned paths, rate limiting** PASS - existing `PATCH /api/v1/grocery-lists/[weekStart]/items/[itemId]` contract is revised with an action-compatible body; checkout contract is revised; handlers stay thin.
- **No duplicate categorization/location logic** PASS - reuse/lift the quick-add category -> location mapping instead of inventing a second table.
- **`expirationStatus` never set manually** PASS - created items go through `.save()` so Mongoose hooks compute status; merged items only update quantity.
- **Branch discipline** PASS - spec came from shared spec branch; planning/tasks are per-branch implementation artifacts on `impl/nextjs` lineage.

## Project Structure

### Documentation (this feature)

```text
specs/007-grocery-checkoff-inventory/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   └── grocery-checkoff-api.md
├── checklists/
│   └── requirements.md
└── tasks.md
```

### Source Code (repository root)

```text
packages/client/
├── app/api/v1/grocery-lists/[weekStart]/
│   ├── items/[itemId]/route.ts       # revised PATCH purchase/unpurchase transition
│   └── complete/route.ts             # revised checkout skip logic
├── src/
│   ├── types/grocery-list.ts         # purchase receipt + purchase prompt payload mirrors
│   ├── services/grocery-lists.ts     # checkOffGroceryItem()/uncheckGroceryItem()/complete revised payload
│   ├── context/GroceryListContext.tsx # purchase-aware toggle actions
│   ├── components/grocery/
│   │   ├── GroceryListItemRow.tsx    # purchased/receipted row state
│   │   └── PurchasePromptSheet.tsx   # new ambiguous-line prompt
│   ├── views/GroceryListPage.tsx     # prompt decision + checkout count/copy refresh
│   └── server/
│       ├── types/grocery-list.ts     # purchase receipt server source of truth
│       ├── models/grocery-list.ts    # item subdoc purchaseReceipt
│       ├── lib/
│       │   ├── purchase-inventory.ts # new add/merge/reverse engine
│       │   ├── ingredient-matcher.ts # reused normalization
│       │   ├── ingredient-categorizer.ts # reused category defaults
│       │   └── unit-normalizer.ts    # reused compatibility checks
│       └── controllers/grocery-lists.ts # atomic guards, cache invalidation, checkout skip
└── tests/
    ├── server/grocery-lists.test.ts
    ├── server/unit/purchase-inventory.test.ts
    ├── components/grocery/PurchasePromptSheet.test.tsx
    ├── components/grocery/GroceryListItemRow.test.tsx
    ├── context/GroceryListContext.test.tsx
    ├── views/GroceryListPage.test.tsx
    └── e2e/grocery-checkoff.e2e.ts
```

**Structure Decision**: everything lands in the existing single `packages/client` app. The purchase engine is a pure server lib so receipt semantics are tested without HTTP; the controller owns atomic state transitions and cache invalidation; the client decides whether an item needs the quick prompt because it already holds list, inventory, and alias caches.

## Phase breakdown (each phase ends runnable + tests green; phases = spec stories)

1. **GC1 - Checked off means it is in my kitchen (US1/P1, MVP).** Extend grocery item receipt types/model. Add `purchase-inventory.ts` with `applyPurchase()` that resolves quantity/unit, merges into same-name non-expired compatible items, creates a new item otherwise, records `{inventoryItemId, quantityAdded, unit, merged}`. Revise item PATCH so `isPurchased:false -> true` is guarded atomically; only the winner applies inventory and stores receipt; losers get 409/refetch semantics. Invalidate recommendations cache after purchase.
2. **GC2 - Un-tick actually un-buys (US2/P2).** Add `reversePurchase()` using the receipt only: decrement merged items, delete created items, clamp if stock was consumed, no-op if target is gone. Revise item PATCH so `isPurchased:true -> false` clears state and receipt even when reversal cannot find stock; double un-check is idempotent.
3. **GC3 - Quick prompt only when inference fails (US3/P3).** Client preflight determines ambiguous servings lines: no real unit, no compatible same-name non-expired inventory item, and no learned alias unit. Show `PurchasePromptSheet` with quantity prefilled, neutral unit default, category-derived location, and optional expiry suggestion from alias memory. Confirm sends resolved `{quantity, unit, location, expiresAt?}`; cancel leaves the line untouched; unit correction writes alias memory.
4. **GC4 - Checkout finalizes what is left (US4/P4).** Revise `completeGroceryList` to skip items with `purchaseReceipt`; add remaining receipt-less items via the same purchase lib using promptless defaults; mark all lines purchased and final. Update smoke/e2e expectations so checkout no longer re-adds mid-shop ticks.
5. **GC5 - Verify + cascade + handoff.** Full lint/test/build/e2e gates; doc cascade in `CLAUDE.md` grocery endpoint/model notes; update `tasks.md` only after tests pass. Leave release/tag/Portainer items unchecked for Claude/human release flow.

## Complexity Tracking

*No constitution violations to justify.* Key judgments: **(a)** receipts are embedded on grocery lines because reversal is line-local and the payload is tiny; **(b)** the client decides prompt-vs-auto because it already has inventory and alias context, while the server validates and applies the resolved payload; **(c)** checkout reuses the same purchase lib so one add/merge/reverse rule set serves both mid-shop ticks and finalization.

## Risks & mitigations

- **Double add under retry/concurrency** -> guarded `findOneAndUpdate` on the grocery-line purchased state; inventory writes happen only after the state transition winner is known; tests fire duplicate PATCHes.
- **Promptless bad units for servings lines** -> auto only when an existing item unit or learned alias unit is available; ambiguous lines go through prompt; checkout uses neutral defaults by spec.
- **Expired stock merged accidentally** -> purchase lib excludes expired same-name items; tests cover expired-only same-name stock.
- **Cross-user inventory corruption** -> every lookup/update includes `userId`; tests seed another user's matching item.
- **Cache staleness** -> grocery controller calls `invalidateUser(userId)` on add and reverse.
- **Generated `expirationStatus` drift** -> new inventory docs are saved through the model; code never writes `expirationStatus`.

## Out of scope

Un-check after a completed list; prices/store metadata; barcode scanning; partial purchases beyond prompt adjustment; daily rolling grocery refresh; `impl/vite` implementation; release tags and Portainer deployment.
