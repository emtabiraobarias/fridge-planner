# Fridge Planner — Claude AI Guide

Primary reference for AI assistants in this repo: structure, workflows, conventions, and
rules that must be followed. **Branch: `impl/nextjs`** (some rules are branch-scoped).

Deep background — *why* things are the way they are, superseded decisions, migration
history — lives in **[`docs/decisions.md`](docs/decisions.md)**. Read it when a rule here
surprises you; don't re-litigate a rule without it.

---

## 1. Overview

Full-stack TypeScript monorepo for meal planning: fridge inventory with expiry awareness,
AI meal suggestions, drag-and-drop weekly calendar, rolling grocery list.

- **One process, port 3000** — React 18 + Next.js 15 (App Router) + Tailwind, with the API
  as Route Handlers in the *same* Next app. No Express, no `:3001` (see §13).
- **Backend layout:** endpoints in `packages/client/app/api/v1/`; server layer (models,
  libs, services, controllers) in `packages/client/src/server/`.
- **AI:** two Holodeck sidecars — meal-recommender (`:8001`) + feedback-collector (`:8002`),
  both OpenAI `gpt-4o`.
- **Monorepo:** one npm workspace, `packages/client` — the Next app is the whole stack.

---

## 2. Commands

Run from the **repo root** unless noted.

```bash
npm run dev            # the whole stack on :3000 (alias: npm run client)
npm run lint           # ESLint, zero warnings
npm run format         # Prettier
npm test               # all Vitest (incl. node-env API tests in tests/server/)

npm -w packages/client run test -- tests/server/inventory.test.ts   # filtered
npm -w packages/client run build      # production build
npm -w packages/client run test:e2e   # Playwright (builds into .next-e2e)

bash scripts/validate-e2e.sh            # release gate: prod build + Mongo (+Holodeck) → smoke
bash scripts/validate-e2e.sh --no-agent # deterministic core only — see docs/smoke-test.md

docker compose up -d mongodb holodeck   # local deps (dev only — prod goes via Portainer, §14)
docker compose up -d --build holodeck-feedback   # second agent, :8002
docker compose logs -f holodeck
```

**Two traps, both cost an hour the first time:**
- **Never run `npm run build` while `next dev` is running** — both use `.next` and the build
  breaks the running server. `test:e2e` is safe (separate `.next-e2e`).
- **Bare `npx playwright test` serves a stale `.next-e2e`.** Only `npm run test:e2e`
  rebuilds. Note also that `.env.local` is read by `next start`, not just `next dev` — it
  can leak dev-seam identity into an e2e build.

---

## 3. Project Structure

```
packages/client/                  # the whole app — UI + API
├── app/                          # App Router: layout, providers, page.tsx (/ → Inventory),
│   │                             #   home/ calendar/ grocery/ feedback/ admin/ auth/ (OIDC callback)
│   ├── nav.tsx                   # ONE nav, three positional modes (spec 010): portrait pill /
│   │                             #   landscape rail / desktop collapsible sidebar (250↔76px)
│   └── api/v1/                   # ROUTE HANDLERS (the backend) — thin; call src/server/controllers
│                                 #   inventory/ meal-plans/ grocery-lists/ recommendations/
│                                 #   quick-add/ feedback/ pipeline/ admin/ me/
├── src/
│   ├── components/               # account/ admin/ calendar/ feedback/ grocery/ home/ inventory/
│   │                             #   recommendations/ shell/ (AppShell) shared/ (Overlay, Toast)
│   ├── context/                  # Inventory, MealPlan, Recommendations, GroceryList, QuickAdd,
│   │                             #   Auth, Feedback, Pipeline, Placement, Toast
│   ├── hooks/                    # useViewportClass, useFocusTrap, useMe, useIsAdmin
│   ├── views/                    # Home/Inventory/Calendar/GroceryList/Feedback/Admin ('use client')
│   ├── services/                 # browser fetch wrappers (http.ts holds the token-refresh retry)
│   ├── lib/                      # date-utils, quick-parse (NL parser), viewport, home-summary
│   └── server/                   # SERVER LAYER — Node-only, every module `import 'server-only'`
│       ├── db.ts                 #   globalThis-cached Mongoose connection
│       ├── auth.ts               #   authenticate() → OIDC JWT verify (jose) + dev seam
│       ├── http.ts               #   ControllerResult + problem() (framework-agnostic)
│       ├── route-helpers.ts      #   withRoute() error wrapper
│       ├── rate-limit.ts logger.ts
│       ├── controllers/ models/ services/ types/
│       └── lib/                  #   expiration, ingredient-*, grocery-list-generator,
│                                 #   unit-normalizer, audit, account-purge
├── tests/                        # Vitest — components/ context/ lib/ views/ app/ + tests/server/
└── e2e/                          # Playwright *.e2e.ts

agents/meal-recommender/ · agents/feedback-collector/   # agent.yaml + instructions/
specs/                            # NNN-feature/{spec,plan,tasks}.md + checklists/
                                  # BRANCHING_STRATEGY.md is canonical on `main` — read before branch work
docker-compose.yml · docker-compose.prod.yml · deploy/ · docs/ · constitution.md · .env.example
```

---

## 4. API Endpoints

Base URL `http://localhost:3000/api/v1` — same process, same origin, no proxy.
All errors are **Problem JSON** (RFC 7807). Deep per-endpoint contracts live in the
owning `specs/NNN-*/spec.md`; this table is the map, not the specification.

**Rate limits:** recommendations 10/min · verify-links 30/min · quick-add parse 20/min ·
feedback chat 10/min (`feedback-chat:${userId}`, shared across both chat endpoints) ·
promote + pipeline 100/min · everything else 100/min.

### Inventory
| Method | Path | Notes |
|---|---|---|
| GET | `/inventory` | query: `category`, `status`, `page`, `limit` |
| POST | `/inventory` | optional `mergeDuplicates:true` (009 FR-IR-012) merges into an existing non-expired, compatible-unit same-name item → 200 `{merged,item,mergedItemId,addedQuantity}`; otherwise the unchanged 201. Only Kitchen quick-add opts in |
| PUT/DELETE | `/inventory/:id` | update / delete |

### Recommendations
| Method | Path | Notes |
|---|---|---|
| POST | `/recommendations` | returns immediately, links NOT awaited. Optional `{ingredientItemIds}` (009 FR-IR-005..010) scopes to that live non-expired subset; absent/empty/all-expired → whole inventory |
| POST | `/recommendations/verify-links` | FR-037 lazy phase: `{mealNames}` (≤10) → `{links, available}` |

### Quick-Add (spec 005)
| Method | Path | Notes |
|---|---|---|
| GET | `/quick-add/aliases` | learned category/location/unit + median shelf-life at ≥2 observations |
| PUT | `/quick-add/aliases/:nameKey` | upsert a learned field / record `observedShelfLifeDays` (FIFO cap 5) |
| POST | `/quick-add/parse` | AI assist, `{text}` ≤200 → `{interpretation\|null}`; **503 without `OPENAI_API_KEY`** (client fails open) |

### Meal Plans
| Method | Path | Notes |
|---|---|---|
| GET | `/meal-plans?weekStart=<ISO>` | fetch weekly plan |
| POST | `/meal-plans/:weekStart/entries` | add entry to slot |
| PUT | `/meal-plans/:weekStart` | replace entries array |
| DELETE | `/meal-plans/:weekStart/entries/:slotId` | remove entry — **no inventory effect** (006 FR-MC-006/014) |
| PATCH | `/meal-plans/:weekStart/entries/:slotId` | 006 lifecycle: `{action:'cook', consumption:[…]}` (atomic idempotent deduct + receipt) or `{action:'uncook'}` (exact restore; 409 for legacy receipt-less entries) |

> **Spec 006 invariant:** planning is inventory-neutral. POST/PUT/DELETE never touch
> inventory; deduction happens only at the cooked confirmation. PUT preserves server-held
> `status`/`cookedAt`/`consumedItems` per surviving `slotId` and ignores client-sent
> lifecycle fields.

### Grocery Lists
| Method | Path | Notes |
|---|---|---|
| GET | `/grocery-lists/:weekStart` | **recomputes on every view** — generated needs date-scoped to today-or-later `planned` entries, persisted (008 FR-RG-001/002/008) |
| POST | `/grocery-lists/:weekStart/generate` | same recompute path as GET (byte-identical for the same instant) — a resync, not a distinct generation |
| POST | `/grocery-lists/:weekStart/items` | add manual item (day-anchored: stamps `addedOn`) |
| PATCH | `…/items/:itemId` | update fields, or 007 purchase lifecycle: `{isPurchased:true, resolvedPurchase?}` adds/merges Kitchen inventory + stores `purchaseReceipt` (stamps `purchasedOn`); `{isPurchased:false}` reverses from the receipt → **409** same-day receipt-less/wrong-state, **404** once the row shed at a rollover (reversal window is same-day only) |
| DELETE | `…/items/:itemId` | remove |
| POST | `/grocery-lists/:weekStart/complete` | checkout: skip receipted rows, apply purchase rules to receipt-less rows, store receipts, mark purchased |

### Feedback & Development Pipeline (spec 003)
| Method | Path | Notes |
|---|---|---|
| POST | `/feedback` · `/feedback/:id/messages` | start / continue a conversation; 409 once `complete` |
| GET | `/feedback[?status]` · `/feedback/:id` · `/feedback/:id/export` | own records; export is spec-template markdown, 409 while `draft` |
| DELETE | `/feedback/:id` | **409 `Pipeline Active`** if a non-`parked` PipelineItem references it; a `parked` item cascades; else 204/404 |
| POST | `/feedback/:id/promote` | promote a `complete` record to stage `approved` — 201 first, idempotent 200 on repeat, 409 `Not Promotable` on a draft, 404 cross-user. Sets source `status:'reviewed'` |
| GET | `/pipeline[?stage=]` · `/pipeline/:id` | **deprecated reads** — kept for the migration window; the same collection is served by `/lifecycle` and `/admin/lifecycle` |
| PATCH | `/pipeline/:id` | ⚠️ **RETIRED — 410 Gone.** Transitions moved to `PATCH /admin/lifecycle/:id` (spec 012). It cannot forward: the old action set assumed `approved→in-spec→in-review→shipped`, and 012 inserts `briefed` and `in-progress`, so the same action name means a different destination. The admin guard still runs first, so a non-admin gets 403 |
| POST | `/feedback/:id/promote` | **superseded** by `PATCH /admin/lifecycle/:id {action:'accept'}`. An item now exists from `complete` (FR-FL-001), so promotion never creates one — it returns its idempotent existing-item 200 and does **not** move the stage |

> `shipped` is reachable **only** via an explicit `approve-release`, never derived from
> record content, and **no transition ever commits, merges, tags, or deploys**
> (FR-F-016/017/018, SC-F-008).

### Feedback Lifecycle (spec 012) — triage to closure

**Two surfaces, and the split is the point (D7).** `/lifecycle/**` is reporter-facing
(`authenticate()`, own items only, projected). `/admin/lifecycle/**` is maintainer-facing
(`requirePrincipalAdmin`, cross-user, full detail). A non-admin on an admin route gets **403,
never 401** — 401 is the client's refresh-retry trigger and would loop.

| Method | Path | Notes |
|---|---|---|
| GET | `/lifecycle` · `/lifecycle/:id` | the reporter's OWN items, projected. A **merged** item returns `mergedTargetStage` and nothing else about the target (FR-FL-019). Another reporter's id → **404, not 403**, so existence is not disclosed |
| GET | `/admin/lifecycle[?stage=&userId=]` | the cross-user triage queue, in maintainer-set rank order (FR-FL-022/023) |
| GET/PATCH | `/admin/lifecycle/:id` | full item · the single action endpoint (below) |
| GET/POST | `…/:id/clauses` · PATCH `…/clauses/:provisionalId` | drafted EARS clauses, each beside the record text it came from · vet one. `POST {}` drafts via the agent; `POST {text,derivedFrom}` authors by hand (FR-FL-031). Shares the `feedback-chat:${userId}` 10/min bucket so drafting cannot bypass the chat limit |
| GET | `…/:id/brief` | `text/markdown`, carries only **accepted** clauses. **Content a human runs — never executed** (FR-FL-033) |
| PUT | `…/:id/reply` | the maintainer's reply to the reporter (FR-FL-036/037) |
| GET | `/admin/releases` | closure picker. **200 even when GitHub is unreachable** — `available:false` is a normal answer, because closure must never be gated on a third party (FR-FL-045) |

**Actions** (`PATCH /admin/lifecycle/:id`, discriminated union, atomic guarded `findOneAndUpdate`):
`accept` (**gate 1**) · `dismiss{reason}` · `merge{targetId}` · `advance` · `approve-spec`
(**gate 2**) · `reject-spec` · `approve-release` (**gate 3**) · `reject-release` · `close{excerpt,…}`
· `park` · `reopen` · `set-rank` · `edit-source` · `attach-artifact` · `cite`.
Illegal/backward/gate-from-wrong-stage/concurrent → **409 `Illegal Transition`**, state unchanged.

> **`shipped` is reachable only through a recorded release approval, and no action ever commits,
> merges, tags or deploys** (FR-FL-057, SC-FL-006/007). `attach-artifact` stores a string and
> never dereferences it.
>
> `briefed → in-spec` is refused while any clause is unvetted (FR-FL-028) — that is what makes
> `briefed` a real stage rather than a label.

### Administration (spec 011) — admin-only unless noted
Requires the admin role via `requirePrincipalAdmin`. An authenticated-but-unprivileged
caller gets **403, deliberately not 401** — the client treats 401 as its FR-D-010
refresh-retry trigger, so 401 would loop. Role comes from a **verified token claim**
(`AUTH_ROLES_CLAIM`, default `realm_access.roles`), never a request header in prod.

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | **not** admin-only — `{userId, isAdmin}`; the UI hides on this |
| GET | `/admin/feedback` · `/admin/feedback/:id` | cross-user triage `?status=&userId=`, pipeline stage joined |
| GET | `/admin/users/:userId/data` | read-only support view — **GET is the only verb** (FR-AD-015) |
| GET | `/admin/users/:userId/export` | everything held, all six collections |
| POST | `/admin/users/:userId/erase` · `/restore` · `/admin/users/purge` | two-phase soft delete (immediately inaccessible, purge after 30d) · undo inside the window, **410** after · explicit purge trigger (no scheduler exists) |
| GET | `/admin/audit` | append-only — **no write verb exists** (FR-AD-022) |
| GET/PATCH | `/admin/settings` | defaults in code; invalid values rejected whole |
| GET | `/admin/usage` · DELETE `/admin/cache` · GET `/admin/limits` · DELETE `/admin/limits/:key` | AI call counts · flush caches (`?userId=`) · inspect/reset limiter buckets |

**`GET /api/health/ready`** (public) — readiness with bounded per-dependency probes.
**`/api/health` must never change shape** — the Docker healthcheck,
`scripts/verify-rollout.sh`, and the smoke gate all depend on it exactly.

---

## 5. Data Models

### InventoryItem
```typescript
{ userId /*indexed*/, name, quantity, unit,
  category /*CATEGORIES*/, location /*LOCATIONS*/,
  expiresAt?: Date /*indexed*/,
  expirationStatus: 'expired'|'expiring-soon'|'normal'|'none' }
```
- `expirationStatus` is auto-computed by Mongoose hooks via `lib/expiration.ts` — **never set it by hand** (§13).
- `expired` = today or earlier (midnight cutoff) · `expiring-soon` = tomorrow · `normal` = 2+ days.

### MealPlan
```typescript
{ userId, weekStart,           // compound UNIQUE index
  entries: [{ slotId, date, mealType: 'breakfast'|'lunch'|'dinner'|'snack',
              meal: MealRecommendation,          // full snapshot
              status?: 'planned'|'cooked',       // spec 006
              cookedAt?: Date,
              consumedItems?: ConsumptionReceiptLine[] }] }   // _id:false subdocs
```
- **`status` has no schema default on purpose** — an absent `status` means a legacy pre-006 entry and reads as `cooked` (FR-MC-011).
- `consumedItems` is the consumption receipt: per-item actual deductions plus `depletedSnapshot` for items removed at zero. Snapshots never carry `expirationStatus`; the pre-save hook recomputes it on restore.
- Meals may carry `groundedIngredients` (`{inventoryItemId,name,quantityToConsume,unit,resolution}`) — validated server-side by `lib/ingredient-grounding.ts`, **never trusted** from agent or client.

### GroceryList
```typescript
{ userId, weekStart,           // compound UNIQUE index
  generatedAt: Date|null,
  items: [{ ingredientName /*normalised key*/, displayName, quantity,
            unit /*default 'servings'*/, category, isPurchased, isManuallyAdded,
            sourceMealNames: string[], notes,
            purchaseReceipt?: { inventoryItemId, quantityAdded, unit, merged },
            addedOn?: Date, purchasedOn?: Date }] }   // spec 008 day anchors
```
- Check-off is **inventory-positive** (007): ticking adds/merges inventory + stores the receipt; un-ticking reverses from it; checkout only adds receipt-less rows.
- **Spec 008 rolling view:** content is recomputed on every GET and force-generate. Generated rows are **reconciled in place by `ingredientName`** (stable `_id`), not wiped-and-recreated. Manual/purchased rows survive same-day refreshes verbatim and are pruned — row *and* receipt, inventory untouched — at the next rollover once their anchor day is past. Legacy anchor-less rows are backfilled to the current day rather than shedding immediately.

### FeedbackRecord
```typescript
{ userId, status: 'draft'|'complete'|'reviewed',      // {userId,status} index
  transcript: [{ role:'user'|'agent', content, at }],
  // structured spec-shaped fields, absent until the conversation completes (FR-F-003):
  type?: 'bug'|'improvement', title?, problemStatement?, userStory?,
  acceptanceCriteria?: [{given,when,then}], reproSteps?: string[],
  expectedBehavior?, actualBehavior?,
  affectedArea?: 'inventory'|'meal-plan'|'grocery'|'recommendations'|'auth'|'feedback'|'other',
  priority?: 'P1'|'P2'|'P3' }
```
`draft` → `complete` when the agent returns a schema-valid record → `reviewed` on first
promotion (a side effect of promotion, not a separate workflow).

### LifecycleItem (spec 012 — was PipelineItem)
```typescript
{ userId,                          // the REPORTER. Detached, NOT deleted, on erasure (D15)
  feedbackRecordId,                // UNIQUE with userId — makes acceptance idempotent in the DB
  sourceTitle, sourceType, sourceAffectedArea,   // immutable snapshot taken at creation
  stage: 'new'|'accepted'|'briefed'|'in-spec'|'in-progress'
       | 'in-review'|'shipped'|'closed'|'dismissed'|'merged'|'parked',
  parkedFromStage?, rank?,         // rank = a ranked QUEUE, not a P1/P2/P3 label (FR-FL-022)
  dismissalReason?: 'no-action-required'|'declined',
  mergedInto?,                     // NEVER projected to a reporter — they see its stage only
  cites?: string[],                // reference only; citing moves nothing (FR-FL-050/051)
  acceptedBy?, acceptedAt?,
  transitions: [{ from, to, actor, actorUserId, at, isGateApproval, note? }],
  clauses: [{ provisionalId, text, derivedFrom /* REQUIRED */, inferred, vetted, editedText? }],
  reply?, closure?, artifacts?, reporterErasedAt? }
```

> ⚠️ **The collection is `pipelineitems`, NOT `pipeline_items`.** The old `PipelineItem` model set
> no explicit collection, so Mongoose's default pluralisation is what production holds. The model
> renamed; the collection did not. Both models still map the same collection during the migration
> — **only `LifecycleItem` may write `stage`**, because the old enum predates the new values and
> rejects them. `scripts/migrate-lifecycle-stages.mjs` renamed the one value that changed
> (`approved → accepted`), once, as an admin task.

> **`derivedFrom` is required on every clause.** Vetting is a *comparison* against the reporter's
> own words (FR-FL-025); a clause with nothing to compare against silently degrades into a
> proofread, and well-formed EARS is easy to accept uncritically.

Indexes: `{userId,feedbackRecordId}` unique · `{userId,stage}` · `{userId,updatedAt:-1}` ·
`{stage,updatedAt:-1}` for the cross-user triage queue, which is deliberately not user-scoped.

### Administration collections (spec 011)
| Collection | Shape | Note |
|---|---|---|
| `admin_audit_logs` | `{adminUserId, action, subjectUserId?, subjectType?, subjectId?, at}` | **TTL 90d**. Append-only because `lib/audit.ts` exports only `record`/`list` — there is no update/delete path |
| `account_erasures` | `{userId (unique), erasedAt, purgeAfter, erasedBy, restoredAt?}` | Exists because there is **no `User` model** — a user is only a `userId` across six collections |
| `runtime_settings` | `{key (unique), value, updatedAt, updatedBy}` | Defaults live in code, so an **empty collection reproduces today's behaviour** |
| `ai_usage_counters` | `{day, feature, calls}` | Incremented at the kill-switch boundary — a blocked call is an uncounted call |

> **The retention margin is load-bearing.** `AUDIT_RETENTION_DAYS` (90) **must** exceed
> `ERASURE_WINDOW_DAYS` (30) so an erasure's audit entry outlives the moment that erasure
> became irreversible. Both in `src/server/types/admin.ts`; a test asserts the relationship
> from the constants.

> **TWO lists in `lib/account-purge.ts`, with different semantics — put a new model in the
> wrong one and you either leak data or destroy it:**
> - `USER_KEYED_MODELS` (**deleted**): inventory-item, meal-plan, grocery-list, ingredient-alias,
>   feedback-record.
> - `USER_DETACHED_MODELS` (**detached, not deleted**): lifecycle-item.
>
> **Adding a model means adding a line to one of them** — omit it and erasure silently orphans
> it. The split arrived with spec 012 D15: the lifecycle collection used to sit in the delete
> list, so erasing a reporter destroyed every item their report had started, including maintainer
> work in flight. A detached item is **not** an orphan for FR-AD-018's purposes — detachment is
> the *defined* outcome, and the item keeps no reporter-identifying content while staying
> advanceable and closable.

---

## 6. Environment Variables

Copy `.env.example` → `.env` at the **repo root** (never inside `packages/`). For local
`next dev`, `MONGODB_URI` + `HOLODECK_URL` go in `packages/client/.env.local`.

| Variable | Value / default | Required |
|---|---|---|
| `MONGODB_URI` | `mongodb://localhost:27017/fridge-planner` | Yes |
| `HOLODECK_URL` | `http://localhost:8001` locally — **no code default, throws if unset** | Yes (AI) |
| `FEEDBACK_AGENT_URL` | `http://localhost:8002` locally — **no code default**; unset/unreachable ⇒ feedback chat returns 502 and preserves the draft | Yes (feedback chat) |
| `OPENAI_API_KEY` | — | Yes for AI — the sole LLM credential (both agents + quick-add parse assist) |
| `BRAVE_SEARCH_API_KEY` / `SPOONACULAR_API_KEY` | — | At least one, for usable recipe links |
| `AUTH_ISSUER` / `AUTH_AUDIENCE` / `AUTH_JWKS_URI` | — | Production OIDC |
| `AUTH_ADMIN_ROLE` | `admin` | No (spec 011) |
| `AUTH_ROLES_CLAIM` | `realm_access.roles` | No — dotted path to the role array in the JWT |
| `AUTH_DEV_USER_ID` / `AUTH_DEV_ROLES` | — | **LOCAL DEV ONLY.** A browser can't send `x-user-id`. Read only on the dev branch of `resolveMode()`. **NEVER set in prod** |
| `GITHUB_REPO` | `owner/name` — the repo whose published releases fill the closure picker (spec 012 D17). **Read-only, unauthenticated, no credential.** Unset ⇒ picker unavailable and closure falls back to free text; it must never block on a third party | No |
| `NODE_ENV` · `LOG_LEVEL` · `REDIS_URL` | `development` · `info` · — | No (Redis is P2+) |

Single same-origin process ⇒ **no `PORT`/`CORS_ORIGIN`/`BACKEND_URL`**.

**Auth (spec 002).** Server: `authenticate(request)` validates an OIDC Bearer JWT with
`jose` (JWKS signature + `iss`/`aud`/`exp`) and returns `sub` as `userId`; failure throws
`AuthError` → `withRoute` → 401 Problem JSON. `AUTH_MODE=dev` keeps the `X-User-Id` seam
for local dev and tests; `AUTH_MODE=oidc` is required in production, where the dev seam is
refused. Client: `services/http.ts` transparently renews expired access tokens via the
refresh grant (single-flight + one retry, FR-D-010); the 12h idle window is a Keycloak
realm setting.

**Session (spec 002 US4).** Sign-out is **RP-initiated** — it clears the local session
*and* redirects to the IdP end-session endpoint, so the next sign-in prompts instead of
silently restoring the same user. That redirect is also the mechanism for FR-D-016: six
data-holding providers sit under `AuthProvider` and a page load destroys their state by
construction, where per-context resets would not. The IdP must have the **post-logout
redirect URI registered** (manual — `docs/deployment.md`); without it the local session
still clears. The account surface lives on **Home + the desktop sidebar footer** and
**must not** become a fifth nav item (FR-D-017).

---

## 7. Code Conventions

**TypeScript** (ESLint + tsconfig enforce these): strict mode incl.
`noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes` · no `any`
(use `unknown`) · **explicit return types on all functions** · no unused vars (`_` prefix
to suppress) · no `console.log` (use `warn`/`error`) · `interface` for object shapes,
`type` for unions · **cyclomatic complexity ≤ 10**.

**Naming:** components PascalCase (`MealCard.tsx`) · utilities/routes kebab-case
(`date-utils.ts`) · interfaces PascalCase · Tailwind mobile-first.

**Prettier:** 2-space, single quotes, trailing commas everywhere (incl. function params),
100-char width, semicolons.

**React:** functional components only · **Context + hooks, never Redux/Zustand** · each
context exports its hook (`useInventory()`, …) · keep UI pure, logic in hooks/context ·
`useCallback`/`useMemo` only when profiling justifies it.

**Route handlers:** thin. `connectDb()` → `await authenticate(request)` → parse/validate
(**Zod**) → call a `src/server/controllers/*` function → `NextResponse.json`. Controllers
return framework-agnostic `ControllerResult` (`{status, body}`) and use `problem()` for
RFC-7807. Wrap every handler body in `withRoute()` so throws become Problem JSON 500.
Rate-limit in the handler via `rateLimit(key, limit, windowMs)`. Server-only modules start
with `import 'server-only'`. **Next 15: `params` is a Promise** — `const {id} = await ctx.params`.

### Responsive viewport classes (spec 010)

Declared in `tailwind.config.ts` → `theme.extend.screens`. Four are stock min-widths;
phone landscape can't be expressed that way (width- *and* orientation- *and* height-bound).

| Class | Prefix | Condition |
|---|---|---|
| Phone portrait | *(base)* | `< 640px` |
| iPad portrait | `sm:` | `≥ 640px` |
| iPad landscape | `lg:` | `≥ 1024px` |
| Desktop | `xl:` | `≥ 1280px` |
| Phone landscape | `phland:` | `(max-width:899px) and (orientation:landscape) and (max-height:500px)` |

**Load-bearing, not stylistic:**
- **`phland` must stay LAST in `extend.screens`.** A landscape phone is ~844px so it also
  matches `sm:`; Tailwind emits screen variants in declaration order and the last-declared
  query wins at equal specificity. `e2e/responsive.e2e.ts` proves it via the 844×390
  wrapper computing `padding-left: 96px`.
- **Use named screens, never arbitrary `min-[…]:`/`max-[…]:` variants.** A `screens` map
  containing an object (the `phland` raw query) **silently disables arbitrary variants
  build-wide** — that's why the shipped `min-[900px]:` became the named `min900:`.
- **Layout:** the app root fills the viewport and `<main>` is the **only** scroll container
  (`AppShell`), so the nav can never scroll away; the padded content wrapper carries
  `box-border` or its padding overflows a `width:100%` box.

---

## 8. Testing

All tests are **Vitest** in `packages/client` (Express + Jest are gone).

**Server layer — `tests/server/`** (handlers) and `tests/server/unit/` (libs/services):
first line `// @vitest-environment node`; in-memory Mongo via `mongodb-memory-server`;
`vitest.config.ts` aliases `@server` → `src/server` and stubs `server-only`. Handler tests
import the route handler, point `process.env.MONGODB_URI` at the memory server, and call it
with real `Request` objects — exercising handler + controller + model end-to-end. Mock
Holodeck by stubbing `getMealRecommendations` (controller tests) **or** `global.fetch`
(agent-client tests).

Three traps that make server tests lie:
- **`db.ts` reads `MONGODB_URI` at module scope** — import routes *after* setting it, or the
  suite silently binds to a real `localhost:27017` (passes locally, fails in CI).
- **The rate limiter is module-level state that survives between tests.** Reset the key in
  `beforeEach` (`resetLimiterKey`) or the Nth call gets a 429 and the assertion checks an
  action that never happened.
- **`it.each` expands at collection time.** A table built in `beforeAll` registers *zero*
  cases. Build matrices at module scope.

**Client — `tests/`** (components/, context/, lib/, views/, app/): jsdom, setup at
`tests/setup.ts` (mocks `next/navigation` and `next/link` — required for anything using
router hooks). **Coverage threshold 70%**; `src/services/` excluded — mock API calls. Test
interactions and rendered output, not implementation details.

**Playwright — `e2e/*.e2e.ts`:**
- **Every new user-facing feature MUST add or extend Playwright coverage of its primary
  journey, as part of the story tasks. A feature is not done without it.**
- **Drive the real controls, not `page.request`.** An e2e that only calls the API proves
  the server works, never that anyone can *reach* it. Spec 011 shipped in 4.12.0 with three
  panels unbuilt (one with its task box already ticked): every server test passed, the smoke
  gate stayed green, and two user stories were curl-only for a whole release. Click the
  button, then assert the **server's** answer changed.
- Stay deterministic: seed through the real API/UI, mock Holodeck-dependent calls at the
  network edge, never hit external services, and **never hardcode a date** — compute
  expiries relative to run time or the test becomes a time bomb.
- **CI runs the full suite** (`E2E browser tests (Playwright)` in `.github/workflows/ci-nextjs.yml`)
  on every push/PR to `impl/nextjs`, alongside the curl-based `validate-e2e.sh` smoke — they
  are separate gates. New `*.e2e.ts` files are enforced by the required `verify` check, not
  only at release.

**Pre-commit:** husky runs `lint-staged` (ESLint fix + Prettier) on staged files.
**Never skip hooks.**

---

## 9. AI Agents (Holodeck)

Two agents, one Holodeck instance each. Both `provider: openai`, `gpt-4o`,
`api_key: ${OPENAI_API_KEY}`, **no web tools** (the backend exposes none for non-Claude
providers — which also removes an injection amplifier).

### Meal Recommender — `agents/meal-recommender/`, port 8001, temp 0.5, max 2000
Receives inventory sorted by expiry, returns a JSON array of `MealRecommendation`.
**Never markdown or prose — raw JSON only** (§13). Active eval: `ExpiryPrioritisation`
(G-Eval via Azure OpenAI at temp 0.0, threshold 0.8); others defined but commented out.
Tracing/metrics/logs export via OTLP. Image published by `.github/workflows/agent-image.yml`
(tag `agent-v*`, linux/amd64).

- **Caching:** `services/recommendations-cache.ts`, keyed `(userId, ingredients)`, **15-min
  TTL**, invalidated per-user on any inventory mutation.
- **Ingredient grounding (006):** inventory lines carry `[id:<_id>]` tags and
  `usesIngredients` is an object array `{inventoryItemId,name,quantityToConsume,unit}`. All
  of it is **untrusted**: `lib/ingredient-grounding.ts` re-validates against live inventory
  (user-scoped id → deterministic name match → learned alias pairing via a cached
  `gpt-4o-mini` lookup, fail-open) and clamps amounts before caching. Legacy string arrays
  still parse. Prompt/schema changes need an `agent-v*` release; the app tolerates both
  shapes during rollout.
- **Recipe URLs:** the agent **must never author `recipeUrl`/`imageUrl`** — no web search
  means fabricated links. `services/recipe-verifier.ts` attaches one server-side only when a
  real page is found (Brave `site:`-restricted over 4 approved domains → Spoonacular
  fallback, gated on title similarity), else omits the field. **FR-037:** results return
  without awaiting verification (5–10 candidate net); the client then POSTs
  `/recommendations/verify-links` (1h per-name server cache), attaches links as they arrive,
  and **removes any meal left unlinked**. `POPULAR_RECIPES` fallbacks carry hand-verified
  links and skip the lazy phase.

### Feedback Collector — `agents/feedback-collector/`, port 8002, temp 0.3
Collects bug/improvement feedback conversationally into spec-shaped records (exportable as
`/speckit.specify` markdown). Evals: `JSONProtocolCompliance`, `ClarifyingQuestionQuality`,
`SpecReadiness`.

- **Protocol (raw JSON only):** the backend is **stateless** — it replays the whole
  transcript each turn, framed with untrusted-data markers. The agent returns exactly one
  object: `{status:"collecting",reply,missing[]}` or `{status:"complete",reply,record{…}}`.
  At the ~30-turn cap the backend appends `FINALIZE NOW`.
- **Wiring:** `services/feedback-collector.ts` (fence-strip + Zod discriminated union),
  `controllers/feedback.ts`, `models/feedback-record.ts`, `lib/feedback-export.ts`, routes
  under `app/api/v1/feedback/**`, UI at `/feedback`.
- **Prod:** image from `.github/workflows/agent-feedback-image.yml` (tag
  `agent-feedback-v*`); runs as internal service `holodeck-feedback` in
  `docker-compose.prod.yml`.

> **Keep the `pip install "holodeck-ai[openai-agents]==<base version>"` line in BOTH agent
> Dockerfiles.** Holodeck 0.7.x routes `provider: openai` to the OpenAI Agents SDK backend,
> which is an optional extra the base image doesn't bundle. Without it the container passes
> `/health` (lazy init) and then **fails on the first chat turn** with
> `No module named 'agents'`.

---

## 10. Git Workflow

> **Two-implementation model.** Two long-lived branches — `impl/vite` and `impl/nextjs` —
> against one shared spec on `main`. Implementation happens on the `impl/*` branch (this is
> `impl/nextjs`); spec/contract changes are authored on `main` and merged down. Read
> `specs/BRANCHING_STRATEGY.md` (canonical on `main`) before any branch operation.

- **Spec/contract work:** short-lived `feat/`/`fix/`/`docs/` off `main` → back to `main`.
- **Implementation work:** on `impl/nextjs`, or `claude/<description>-<id>` branches off it
  that merge back to **`impl/*`, never `main`**.
- **`origin/main` has disjoint history and contains no `packages/`** — base implementation
  worktrees on impl HEAD, never on `origin/main`.
- Conventional Commits. `npm run lint && npm test` must pass before pushing. PRs need all
  tests green and zero lint warnings.
- Shared files (`spec.md`, `checklists/*`, `ROADMAP_PROGRESS.md`, `scripts/smoke-test.sh`,
  `constitution.md`) stay **byte-identical across branches and are edited only on `main`**.
  Per-branch files (`plan.md`, `tasks.md`, `CLAUDE.md`, `docs/*`, code) never exist on `main`.

---

## 11. Feature Specification Workflow

Spec-first. Templates in `.specify/templates/`, driven by slash commands in `.claude/commands/`.

1. **Scaffold** `.specify/scripts/bash/create-new-feature.sh <name>` → numbered dir under `specs/`
2. **`/speckit.specify`** → `spec.md` (each user story independently testable)
3. **`/speckit.plan`** → `plan.md` (architecture, component design, API changes, phases)
4. **`/speckit.tasks`** → `tasks.md` (implementation checklist)
5. **`/speckit.analyze`** → cross-checks spec/plan/tasks for gaps before coding
6. **`/speckit.implement`** or work `tasks.md` manually

Also: `/speckit.clarify`, `/speckit.checklist`, `/speckit.constitution`, `/speckit.taskstoissues`.

### Bug fix vs spec tweak — decide first
- *"The code is wrong for what we originally intended"* → **bug fix: code only.**
  Locate the violated `FR-XXX` in `specs/<feature>/spec.md`; write a failing test **citing
  the FR in its name** (`it('excludes items expiring today (FR-007)', …)`); fix; commit
  referencing the FR. **If no FR covers it, the spec is incomplete — that's a spec tweak.**
- *"What we intended has changed"* → **spec tweak: cascade in strict order** —
  `spec.md` → run `/speckit.analyze` → `plan.md` → `tasks.md` → `checklists/` →
  `.specify/memory/constitution.md` (amend only on a real conflict; MINOR for new guidance,
  PATCH for clarifications). Code that no longer satisfies the revised requirement is then a
  bug — apply the bug-fix workflow.

> Wanting to change the spec so it matches the code is the tell that you're doing a spec
> tweak, not a bug fix. Stop and switch workflows.

---

## 12. Known Issues & TODOs

| ID | Description | Location |
|---|---|---|
| CR-013 | OpenAPI 3.0 spec not written — deferred until the API shape stabilises post-Phase 2 | `app/api/v1/` |
| — | Drag-and-drop has intermittent bugs noted in commit history | `src/views/CalendarPage.tsx` |
| — | Redis-backed cache deferred to Phase 2+ | `REDIS_URL` |

---

## 13. Things NOT to do

**Don't add a vector store or embedding layer to the AI agent.** ChromaDB + Ollama
embeddings were added and removed (`983ec78`). The recommender receives structured
inventory JSON directly; semantic search is over-engineering here.

**Don't let the meal recommender return prose or markdown.** The prompt was rewritten to
enforce raw JSON (`4082def`); loosening it breaks the client's parser.

**For Anthropic agents, don't set `auth_provider: api_key` in `agent.yaml`.** Dormant —
both agents are `provider: openai` with `api_key:` (no `auth_provider`). If an Anthropic
agent returns, use `auth_provider: oauth_token`; `ANTHROPIC_API_KEY` is the fallback, not
the default (`da0f65f`).

**Don't use `.js` extensions in server-layer imports.** `src/server/` is bundled by Next
(`moduleResolution: Bundler`) — extensionless imports, `@server/*` alias across trees. This
is the *opposite* of the retired Express `NodeNext` rule.

**Don't import `src/server/*` from a Client Component.** It's Node-only (Mongoose, secrets)
and guarded by `import 'server-only'`, which throws if pulled into the client bundle.
Browser code reaches the API only through `src/services/*`.

**Don't re-introduce Express or a separate API server.** Phase C-bis retired it into Route
Handlers on one process; `packages/server` was deleted. Add backend behaviour as a Route
Handler + controller. (Branch-scoped — `impl/vite` still runs Express.)

**Don't manually set `expirationStatus` in `findOneAndUpdate`.** A Mongoose
`pre('findOneAndUpdate')` hook computes it whenever `expiresAt` changes, including the clear
path (`expiresAt: null` → `$unset` + `none`). Writing it directly yields a stale value or is
overwritten. **Hot-reload gotcha:** the model is reused across `next dev` reloads via the
`mongoose.models` guard, so schema/hook edits need a dev-server restart.

**Don't add state management libraries (Redux, Zustand, …).** Context + hooks only —
a third-party store duplicates the pattern and violates `constitution.md`.

**Don't revert this branch to Vite or recreate `vite.config.ts`.** Branch-scoped: the Vite
implementation lives on `impl/vite` and is kept alive deliberately — don't delete or "fix"
it from here. On `impl/nextjs` the migration is complete (`08c9e47`): no `vite.config.ts`,
`vitest.config.ts` is tests-only, dev runs on 3000.

**Don't create `src/pages/` in the client.** Next reserves `pages/` for the Pages Router;
the App Router is `app/` and page-level views are `src/views/`.

---

## 14. Deployment (Portainer CE, orchestrated)

Staged runbook: stand the stack up **internally first** (Stage 1 — `fridgeplanner.lan`,
Caddy internal CA), prove it end-to-end, then go public (Stage 2 — real domain, Let's
Encrypt, router forwarding). **The internal smoke test is a hard gate before any Stage 2 step.**

**Files:** `docker-compose.prod.yml` (only `caddy` publishes ports; everything else internal
on `fpnet`; `${VAR:?}` fail-fast; `AUTH_JWKS_URI` targets internal `http://keycloak:8080`
by design while `AUTH_ISSUER` uses the public host) · `deploy/Caddyfile` ·
`deploy/prod.env.example` (placeholders only) · `deploy/checklist.yaml` (step manifest) ·
`deploy/state.json` (resumable progress) · `docs/deployment.md` (prose runbook) ·
`.claude/skills/deploy-runbook/SKILL.md` (orchestrator — `/deploy-runbook`) ·
`.claude/agents/deploy-file-writer.md` (edits deploy files; never deploys) ·
`.github/workflows/deploy-nextjs.yml` (digest-pinned build-push; **edit, never regenerate**).

**Automation boundary:**
- **Agent may:** verify/edit the deploy files and CI workflow; **roll out an approved
  release** (below).
- **Human only (the orchestrator stops and never simulates):** stack creation, stack env
  vars, registry credentials, container console, trusting the internal CA, router
  port-forwarding, host firewall, DNS, Keycloak realm/client config.

**Releasing — the pin bump IS the deploy.** Every image in `docker-compose.prod.yml` is
pinned to an explicit version in git. Portainer's GitOps poll sees the new commit and the
resolved tag isn't in the local cache, forcing a pull.

> **Order is load-bearing: merge → tag → wait for CI green (image on GHCR) → bump the pin →
> `scripts/verify-rollout.sh <version>`.** Never bump before the image exists or the poll
> pulls a missing tag. Rollback = revert the bump commit. Preconditions: tagged, CI green,
> and **release approved by the user** — automation covers the rollout, not the decision to
> ship. (`scripts/deploy-release.sh <version>` forces an immediate redeploy but needs an API
> token nobody is required to provide.)

> **Always cut the tag with `scripts/cut-release.sh <version>` — never bare `git tag`.** It
> resolves the target from `origin/impl/nextjs` **after fetching**, so the tag cannot land on
> whatever an unrelated worktree has checked out, and it refuses a version that doesn't
> contain the previous release. This exists because 4.14.0 was a *lightweight* tag on a commit
> **139 behind** the branch: CI built that tree, published it as `:4.14.0`, and Portainer
> deployed it faithfully — prod served two-month-old code while `/api/health` returned 200.
> A second near-miss the same day (4.14.1, cut on a 4-commit-stale HEAD) silently dropped a
> merged PR's admin panels. **The pin can be perfectly correct and the image still wrong.**
> The `guard` job in `deploy-nextjs.yml` is the backstop — it rejects lightweight tags, tags
> off `impl/nextjs`, and tags that don't contain the prior release, before any image is built.
> It would have caught 4.14.0; only the script catches the 4.14.1 stale-HEAD case.

**Rules:**
- **Secrets never enter the repo** — only `deploy/prod.env.example` placeholders are
  committed. Real values go in Portainer stack env or a host `.env`.
- **`AUTH_ALLOW_DEV` must never appear in any committed file or production env**, and never
  set `AUTH_DEV_*` in production.
- App image is `ghcr.io/emtabiraobarias/fridge-planner-client`; `…/fridge-planner` (no
  suffix) is the Holodeck image.
- Prod deploys **through Portainer**; the `docker compose` commands in §2 are local-dev only.
- **Never conclude a release landed from `/api/health` returning 200** — a stale container
  returns that too. `/api/health` reports the `version` baked in at build time from the git
  tag; `scripts/verify-rollout.sh <version>` is the check. 4.9.0 and earlier report no
  `version` field. This exact trap hid a stalled rollout for a day.

---

## 15. Orchestration workflow

You are the orchestrator: plan, decompose, synthesize. Reasoning-heavy phases go to
**deep-reasoner**; mechanical work to **fast-worker**. For high-stakes decisions run
deep-reasoner twice with slightly different framings and synthesize. Keep your own context
lean — delegate rather than doing mechanical work yourself.
