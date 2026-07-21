# Quickstart — Daily Rolling Grocery-List Refresh (`impl/nextjs`)

Dev/test walkthrough for spec 008. Prereqs: MongoDB and Holodeck available for normal app flows (`docker compose up -d mongodb holodeck`), plus `packages/client/.env.local` with `MONGODB_URI`, `HOLODECK_URL`, and `AUTH_MODE=dev` for local manual testing.

> Spec 008 is a superset of 006/007: cook shrinks needs (006), buy grows inventory (007), **day rollover sheds stale meals + rows (008)**. "Today" is derived from the server clock — to exercise rollovers manually, change the host date/clock (or use fake timers in tests) rather than any UI control.

## Run it

```bash
npm run dev
```

1. **Date-scoped generation (RG1)**: Calendar → plan a planned (uncooked) dinner for **yesterday** and one for **tomorrow**, each needing the same ingredient → Grocery → Regenerate. Only the tomorrow dinner's ingredients appear; the yesterday dinner contributes nothing (FR-RG-001). A line sourced from both shows only the tomorrow meal's shortfall and lists only the tomorrow meal in its sources (FR-RG-007).
2. **Removal of fully-past needs (RG1)**: with a generated, unpurchased line whose only source meal was yesterday, Regenerate → the line is gone (FR-RG-006).
3. **Same-day integrity (RG2)**: tick a generated line purchased (Kitchen increments per spec 007; the row now carries `purchasedOn`=today) and add a manual item (`addedOn`=today). Refresh the grocery page repeatedly the same day → both rows persist unchanged, receipt intact (FR-RG-004/005). Un-tick the purchased row → it reverses exactly per its receipt (FR-RG-011), unaffected by the refreshes.
4. **Daily shed (RG2)**: advance the host clock past midnight (or set the meal/purchase to "yesterday"), refresh → the purchased row and the manual item are gone from the list; Kitchen still holds the purchased stock and the list does **not** re-ask for it (owned stock nets it off — FR-RG-005/011). Un-ticking the shed row is no longer offered (404).
5. **Auto-freshness on view (RG3)**: with a list last computed "yesterday," open the Grocery page today with no explicit action → the shown needs already reflect today's scope (FR-RG-002, SC-RG-002). Cook a today-onwards meal, reopen → its need is reduced with no manual regenerate (SC-RG-004). Manual Regenerate produces an identical list (FR-RG-002 scenario 2).
6. **Future-week view (RG3)**: navigate to next week's list → all of that week's planned meals count, since every date is today-or-later (FR-RG-002 scenario 3).

## Test it

```bash
npm -w packages/client run test -- tests/server/unit/rolling-grocery.test.ts
npm -w packages/client run test -- tests/server/grocery-lists.test.ts
npm test
npm -w packages/client run build
npm -w packages/client run test:e2e
bash scripts/validate-e2e.sh --no-agent
```

- Use `vi.useFakeTimers()` + `vi.setSystemTime()` to cross the midnight boundary deterministically; add a focused boundary case at local 23:59 vs 00:01 to lock down the local-vs-UTC cutoff (Research D3).
- Server tests seed meal-plan entries with explicit `date` values relative to a fixed "now," assert generated needs before/after the cutoff, and fire a recompute between a tick and an un-tick to prove receipt preservation (FR-RG-011).

## Verification log

- *(to be filled during implementation — baseline before RG1, then per-phase lint/test/build/e2e results)*

## Release handoff

- [ ] Create release/version tag after review
- [ ] Build and push deployment images
- [ ] Redeploy through Portainer and verify production health checks
- [ ] Run post-deploy smoke validation against the deployed URL
- [ ] Confirm spec 001 FR-025/026/030/031 cascade merged on `main` (FR-RG-012)

## Gotchas

- **GET now mutates**: recompute-on-view persists the reconciled document. Generated rows keep their `_id` via name-reconcile, so an in-flight tick from a prior render still targets a live row; a lost race already refetches on 404/409 (existing `GroceryListContext`).
- **Local vs UTC midnight**: meal entries are stored at UTC midnight (`getWeekDays`), the host runs local — the cutoff maps the local calendar day onto the UTC-midnight axis. Get this wrong and meals flip in/out of scope near midnight.
- **Shed is final for reversal**: after a purchased row sheds, its receipt is gone and un-tick 404s; the inventory addition stays. Correct a post-shed purchase via normal Kitchen editing, not un-tick.
- **Rolling recompute touches no inventory** — so it never invalidates the recommendation cache (only 007 tick/checkout do).
- **Legacy rows**: pre-008 manual/purchased rows without an anchor are lazily stamped to the recompute day, so they survive one day rather than vanishing on deploy.
- Do not add a scheduler/cron — recompute-on-view is the clarified mechanism (FR-RG-002).
