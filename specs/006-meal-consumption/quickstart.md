# Quickstart — Inventory-Grounded Meal Consumption (`impl/nextjs`)

Dev/test walkthrough for the feature. Prereqs: MongoDB + Holodeck up (`docker compose up -d mongodb holodeck`), `packages/client/.env.local` with `MONGODB_URI` + `HOLODECK_URL` (+ `OPENAI_API_KEY` for the tier-3 alias lookup — optional, fails open).

## Run it

```bash
npm run dev        # whole stack on :3000
```

1. **Ground (MC1)**: Kitchen → add "Chicken Thighs, 1 kg, fridge" (+ a few items). Meal plan → get suggestions. Each meal's uses-list now reflects real items; open a meal — amounts shown come from `groundedIngredients`.
2. **Plan ≠ consume (MC2)**: drag a meal onto the calendar → Kitchen quantities unchanged (previously they dropped immediately).
3. **Cook (MC2)**: tap the planned tile → detail modal → **Mark cooked** → review sheet pre-fills 500 g chicken → adjust to 300 g (or zero a line) → Confirm. Kitchen now shows 700 g. Tile shows the cooked badge.
4. **Idempotent**: replay the PATCH (double-tap / `curl` twice) → second call 409s, no double-deduct.
5. **Un-cook (MC3 — not implemented yet)**: this is the next story. For now, `PATCH ... { "action": "uncook" }` returns 409 by design until T020-T023 are complete.
6. **Groceries (MC4 — not implemented yet)**: this follows US3. The current grocery generator has not yet been updated for planned-only grounded quantity netting.

## Test it

```bash
npm -w packages/client run test -- tests/server/unit/ingredient-grounding.test.ts
npm -w packages/client run test -- tests/server/unit/ingredient-consumption.test.ts
npm -w packages/client run test -- tests/server/meal-plans.test.ts        # PATCH lifecycle
npm -w packages/client run test -- tests/server/unit/grocery-list-generator.test.ts
npm test                                   # everything
bash scripts/validate-e2e.sh --no-agent    # release gate
```

Key suites by phase: grounding corpus (tiers + hostile inputs: foreign IDs, absurd amounts); cook lifecycle (idempotency race, depletion receipt, legacy no-status entries); then future US3 un-cook/depletion restoration and US4 generator netting scenarios.

## Agent change

`agents/meal-recommender/instructions/system-prompt.md` + `agent.yaml` changed → rebuild the sidecar to see grounded output locally:

```bash
docker compose up -d --build holodeck
docker compose logs -f holodeck   # verify healthy
```

Without the rebuilt agent the app still works: ungrounded meals follow the legacy 1-unit path at cook time.

## Gotchas

- **Legacy entries** (created before this feature): render as cooked, cannot be un-cooked (409) — expected (FR-MC-011), not a bug.
- **Model hot-reload**: `meal-plan.ts`/`ingredient-alias.ts` schema edits need a dev-server restart (`mongoose.models` guard, CLAUDE.md §14).
- **Never** set `expirationStatus` in restore code — recreate via `.save()` so the hook computes it.
- Recs cache: cooking invalidates it (`invalidateUser`) — if suggestions look stale after cooking, that's a bug in MC2 wiring.
