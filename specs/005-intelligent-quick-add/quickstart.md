# Quickstart — Intelligent Quick-Add Understanding (`impl/nextjs`)

Phase 1 output: how to develop and verify this feature locally.

## Prerequisites

```bash
docker compose up -d mongodb          # Mongo :27017 (Holodeck not needed for this feature)
npm run dev                           # Next.js app on :3000 (MONGODB_URI in packages/client/.env.local)
```

IQ4 only: set `OPENAI_API_KEY` (root `.env` / `packages/client/.env.local`). Without it the assist endpoint returns 503 and the app behaves as if assistance is disabled — everything else works.

## Where things live

| Piece | Path |
|---|---|
| Parser (pure, client) | `packages/client/src/lib/quick-parse.ts` |
| Kitchen quick-add UI | `packages/client/src/components/inventory/QuickAdd.tsx` |
| Groceries quick-add | `packages/client/src/views/GroceryListPage.tsx` |
| Shared chip preview (IQ2) | `packages/client/src/components/shared/ParsePreview.tsx` |
| Alias cache context (IQ3) | `packages/client/src/context/QuickAddContext.tsx` |
| Server: routes | `packages/client/app/api/v1/quick-add/**` |
| Server: controller / model / assist | `src/server/controllers/quick-add.ts`, `models/ingredient-alias.ts`, `services/parse-assist.ts` |
| Canonical algorithm + corpus | `specs/004-organic-redesign/design/reference-logic.md` §1 (**edit on `main` only**) |

## TDD loop (IQ1 first)

```bash
# parser corpus — written before extending the parser; inject a fixed TODAY
npm -w packages/client run test -- tests/lib/quick-parse.test.ts

# server layer (IQ3/IQ4) — node env + mongodb-memory-server; mock global.fetch for assist
npm -w packages/client run test -- tests/server/quick-add.test.ts

npm test            # everything (coverage gate ≥70%)
npm run lint        # zero warnings
```

Parser tests pin `TODAY` (e.g. `new Date(2026, 6, 12)`) exactly like the reference-doc worked examples, so corpus rows translate 1:1 into `expect` calls.

## Manual smoke (per phase)

- **IQ1**: Kitchen quick-add → type `500 grams mince in the freezer use by 20/7` → preview shows *Mince · 500 g · Meat · freezer · expires 20 Jul*; `milk 2L, 6 eggs` adds two items. Repeat one phrase on the Groceries screen.
- **IQ2**: type `spinach` → category/location chips look tentative (dashed); tap location → pick pantry → saved item lands in pantry.
- **IQ3**: correct `tortillas` to pantry once; clear input; type `tortillas` again → pantry appears pre-applied (learned styling). Second browser/user must NOT see it (FR-036).
- **IQ4**: with `OPENAI_API_KEY` set, type `gochujang`, pause → category upgrades from Other (tentative styling). Stop the network → same input silently stays deterministic.

## Release gate

```bash
bash scripts/validate-e2e.sh --no-agent   # deterministic core 9/9 must stay green
npm -w packages/client run build          # next build clean
```

Ship per the usual flow: tag `nextjs-v*` → CI build-push → Portainer *Pull and redeploy* (see `docs/deployment.md`).
