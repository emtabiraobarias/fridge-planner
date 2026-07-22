# Quickstart — Ingredient-Driven Recipe Search + Manual-Only Recommendations (`impl/nextjs`)

Dev/test walkthrough for spec 009. Prereqs: MongoDB + Holodeck (`docker compose up -d mongodb holodeck`), plus `packages/client/.env.local` with `MONGODB_URI`, `HOLODECK_URL`, `AUTH_MODE=dev`, and at least one of `BRAVE_SEARCH_API_KEY` / `SPOONACULAR_API_KEY` for usable recipe links (FR-037). `OPENAI_API_KEY` drives the agent.

> Spec 009 changes only the **input scope** and the **trigger** of the recommendations pipeline, plus an EC-03 quick-add merge. Everything downstream (agent, spec 006 grounding, the 15-min ingredient-keyed cache, FR-037 links, the 10/min limit, EC-01/EC-08 fallbacks) is reused unchanged — if a scoped or manual flow behaves differently downstream, that's a regression, not a feature.

## Run it

```bash
npm run dev
```

1. **Manual trigger + empty state (IR1)**: log in and land on the Kitchen home (`/`). With inventory present, confirm **no** recommendation request fires on load (watch the Network tab — zero `POST /recommendations`) and a calm empty state with a **Get Recommendations** button is shown (FR-IR-001/002, SC-IR-001). Tap it → whole-inventory suggestions load exactly as before, including FR-037 "Finding recipe…" link settling (FR-IR-004).
2. **Session persistence (IR1)**: after step 1, navigate to `/calendar` and back to `/`. The earlier suggestions are still shown with **no** new request (FR-IR-003) — they live in the app-level `RecommendationsProvider`.
3. **Empty-inventory path (IR1)**: with an empty fridge, tap Get Recommendations → the EC-01 popular-recipes fallback still applies (the manual trigger changes *when* the call happens, not the empty-inventory behaviour, FR-IR-004 scenario 4).
4. **Kitchen scoped search (IR2)**: add "chicken" and "spinach" (plus other items). Enter Kitchen **select mode**, tick those two, tap **Find recipes with selected** → the returned suggestions are grounded only on chicken + spinach (SC-IR-003), and the sooner-to-expire of the two is favoured (FR-IR-009). Clear the selection and request again → falls back to whole inventory (FR-IR-010, FR-IR-007).
5. **Suggestions-rail scoped search (IR2)**: on `/calendar`, activate the ingredient-filter chips for the same two items and request suggestions → the scoped result is **identical** to the Kitchen-initiated one (SC-IR-004) — both hit the one `POST /recommendations` with the same `ingredientItemIds`.
6. **Per-selection cache (IR2)**: repeat the same selection within 15 minutes → the second request returns instantly with no agent call (a cache hit on the per-selection `buildCacheKey`, FR-IR-011, SC-IR-005). Watch the server log — no `getMealRecommendations` call the second time.
7. **Quick-add duplicate merge (IR3)**: with an existing non-expired "Milk" (unit L), quick-add `milk 1L` → **no** duplicate row; the existing Milk's quantity increases and an **Undo** toast appears (FR-IR-012). Tap **Undo** → inventory returns to the exact pre-merge state (SC-IR-006, FR-IR-013). Then make "Milk" expired (or add `milk 500g` against an L item) and quick-add again → a **separate** new item is created, no merge (FR-IR-012 scenario 3, spec 007 FR-GC-005).

## Test it

```bash
npm -w packages/client run test -- tests/server/recommendations.test.ts
npm -w packages/client run test -- tests/server/inventory.test.ts
npm -w packages/client run test -- tests/server/unit/inventory-merge.test.ts
npm test
npm -w packages/client run build
npm -w packages/client run test:e2e
bash scripts/validate-e2e.sh --no-agent
```

- **Scoped recommendations (IR2)**: seed a user with several non-expired items; call `getRecommendations(userId, [idA, idB])` with `getMealRecommendations` stubbed and assert the stub received **only** `idA`/`idB`'s ingredients and that `groundMeals` resolved only those; call again with the same ids and assert a **cache hit** (stub called once); call with an all-expired/empty id set and assert the whole-inventory ingredient set was sent (FR-IR-010).
- **EC-03 merge (IR3)**: seed an existing non-expired "Milk"; `createInventory(userId, {name:'milk', unit:'L', quantity:1, mergeDuplicates:true})` → assert **one** item, quantity summed, response `{ merged:true, addedQuantity }`. Repeat with an expired "Milk" and with an incompatible unit → assert **two** items, `merged:false`. Unit-test the extracted `findMergeTarget`/`mergeInto` in `inventory-merge.test.ts`, and add a regression asserting the spec-007 `applyPurchase` still behaves identically after the extraction.
- **No-auto-load + CTA + Undo (RTL)**: `RecommendationsPanel` mounts without calling `fetchRecommendations` and shows the CTA; a click makes exactly one call; a re-mount with results in context makes none. `InventoryPage`/`SuggestionsRail` selection surfaces build the same id set. The quick-add merge shows an Undo toast whose action reverses the quantity.

## Verification log

*(Per-task entries appended during implementation, mirroring spec 008's log — baseline, per-phase TDD red→green notes, and full-gate runs.)*

## Release handoff

- [ ] Create release/version tag after review
- [ ] Build and push deployment images
- [ ] Redeploy through Portainer and verify production health checks
- [ ] Run post-deploy smoke validation against the deployed URL
- [ ] Confirm spec 001 FR-012/FR-014 + EC-03 cascade merged on `main` (FR-IR-014)

## Gotchas

- **Two recommendation surfaces**: the auto-load to remove is the `RecommendationsPanel` prefetch `useEffect` on the **Kitchen/home** (`InventoryPage`, login landing `/`) — the calendar `SuggestionsRail` is already manual-trigger. Don't add a second auto-fetch anywhere.
- **Zero calls on fresh visit (SC-IR-001)**: verify with the Network tab, not just the UI — a stray effect that fetches "to warm the cache" would violate FR-IR-001.
- **Scope is a subset filter, not a new pipeline**: pass the selected items into the *existing* `groundMeals`/`buildCacheKey`/agent path. Per-selection caching and grounding are emergent — do not add a scoped cache or a scoped grounding path.
- **Empty/all-expired selection ⇒ whole inventory**, never an empty agent call (FR-IR-010) — the server guards this even if the client sent ids.
- **Merge is opt-in**: only the quick-add path sets `mergeDuplicates`; a plain `POST /inventory` must still create. Undo subtracts the recorded delta (clamp ≥0) — never reset to a stale absolute, so intervening edits survive (spec EC "Undo after further edits").
- **Cache invalidation on merge**: a merge mutates inventory, so it must call `invalidateUser(userId)` like every other inventory write, or a stale scoped/whole result could linger.
- Do not add a `SelectionContext` or persist the selection — it is transient per-surface (spec Key Entities); only the *result* is shared, and it already is (app-level provider).
