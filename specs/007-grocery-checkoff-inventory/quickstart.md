# Quickstart - Grocery Check-Off Flows Into Kitchen Inventory (`impl/nextjs`)

Dev/test walkthrough for spec 007. Prereqs: MongoDB and Holodeck available for normal app flows (`docker compose up -d mongodb holodeck`), plus `packages/client/.env.local` with `MONGODB_URI`, `HOLODECK_URL`, and `AUTH_MODE=dev` for local manual testing.

## Run it

```bash
npm run dev
```

1. **Generate a list (GC1)**: Calendar -> plan meals for the week -> Grocery -> Regenerate. Confirm generated lines are visible and initially unpurchased.
2. **Tick a real-amount line (GC1)**: tick "Mince - 100 g". Kitchen should show Mince increased by exactly 100 g immediately, without pressing Done shopping.
3. **Retry/double-tick (GC1)**: trigger the same PATCH twice. The second call should return 409/refetch semantics and Kitchen should still have only one addition.
4. **Merge (GC1)**: with non-expired "Milk" already in Kitchen, tick "Milk x3". Kitchen should increment the existing Milk item using its unit, not create a duplicate.
5. **Un-tick (GC2)**: uncheck the ticked line. Kitchen should reverse the receipt: created item removed or merged quantity decremented. If some stock was consumed in between, reversal clamps and never goes negative.
6. **Ambiguous prompt (GC3)**: tick a servings line with no same-name Kitchen item and no learned unit. A compact prompt opens with quantity prefilled; Cancel leaves the line untouched; Confirm creates inventory using entered values. Tapping the expiry suggestion is the only way expiry is applied.
7. **Checkout (GC4)**: tick 2 of 4 lines, then Done shopping. The 2 ticked lines are skipped; the 2 remaining lines are added once; the list is finalized/purchased.

## Test it

```bash
npm -w packages/client run test -- tests/server/unit/purchase-inventory.test.ts
npm -w packages/client run test -- tests/server/grocery-lists.test.ts
npm -w packages/client run test -- tests/components/grocery/PurchasePromptSheet.test.tsx
npm -w packages/client run test -- tests/context/GroceryListContext.test.tsx
npm -w packages/client run test -- tests/views/GroceryListPage.test.tsx
npm test
npm -w packages/client run build
npm -w packages/client run test:e2e
bash scripts/validate-e2e.sh --no-agent
```

## Verification log

- 2026-07-18 baseline before implementation: `npm run lint` passed; `npm test` passed (53 files, 517 tests, coverage 93.25%). Existing warnings are from already-covered negative-path tests and React `act(...)` warnings in pre-existing suites.
- 2026-07-18 US1 complete: focused purchase tests passed (`purchase-inventory`, grocery PATCH handler, grocery context, grocery row); `npm run lint` passed; `npm test` passed (54 files, 529 tests, coverage 92.83%); `npm -w packages/client run build` passed.
- 2026-07-18 US2 complete: focused reversal tests passed (`reversePurchase`, grocery PATCH un-tick, grocery context); `npm run lint` passed; `npm test` passed (54 files, 538 tests, coverage 92.90%); `npm -w packages/client run build` passed.
- 2026-07-18 US3 complete: focused prompt tests passed (`PurchasePromptSheet`, grocery page prompt/inference flow, grocery context resolved purchase forwarding); `npm run lint` passed; `npm test` passed (55 files, 545 tests, coverage 93.03%); `npm -w packages/client run build` passed.
- 2026-07-18 US4 complete: focused checkout tests passed (`grocery-lists` server checkout, grocery page receipt-less checkout count, grocery context refresh); `npm run lint` passed; `npm test` passed (55 files, 546 tests, coverage 92.94%); `npm -w packages/client run build` passed; `env NEXT_DIST_DIR=.next-e2e npx next build` passed; `npx playwright test e2e/grocery-checkoff.e2e.ts` passed (1 test). The first direct Playwright attempt failed because `.next-e2e` was stale; rebuilding `.next-e2e` fixed it.
- 2026-07-18 GC5 complete: after local commit `1185746`, `CLAUDE.md` and smoke docs were cascaded. `npm run lint` passed; `npm test` passed (55 files, 546 tests, coverage 92.94%); `npm -w packages/client run build` passed; `npm -w packages/client run test:e2e` passed (13 Playwright tests). The first full e2e run exposed a stale redesign checkout expectation; it now uses spec 007 semantics where checked rows are already in Kitchen and checkout finalizes receipt-less rows. `bash scripts/validate-e2e.sh --no-agent` passed with `pass=15 fail=0` after rerunning with Docker/local-server permissions; the non-escalated first attempt failed because sandboxing denied Docker socket access.

## Release handoff

- [ ] Create release/version tag after review
- [ ] Build and push deployment images
- [ ] Redeploy through Portainer and verify production health checks
- [ ] Run post-deploy smoke validation against the deployed URL

## Gotchas

- Mid-shop tick is the inventory mutation now; checkout must never double-add a line that has `purchaseReceipt`.
- Legacy purchased lines without a receipt cannot be exactly reversed. Return a clear 409 rather than guessing.
- Expired same-name inventory is never a merge target.
- Do not write `expirationStatus`; save new `InventoryItem` documents and let hooks compute it.
- Client prompt decisions are convenience only. The server still validates all resolved values and scopes every inventory operation by `userId`.
