# Quickstart — 012 Feedback Lifecycle (`impl/nextjs`)

How to run and exercise the lifecycle locally. Assumes the repo-root setup in `CLAUDE.md` §2.

## Prerequisites

```bash
docker compose up -d mongodb holodeck holodeck-feedback   # local deps
npm run dev                                                # whole stack on :3000
```

`packages/client/.env.local`:

```bash
MONGODB_URI=mongodb://localhost:27017/fridge-planner
HOLODECK_URL=http://localhost:8001
FEEDBACK_AGENT_URL=http://localhost:8002
AUTH_MODE=dev
AUTH_DEV_ROLES=admin        # LOCAL ONLY — never in production
GITHUB_REPO=emtabiraobarias/fridge-planner   # NEW (D17), no credential
```

> `AUTH_DEV_ROLES` applies **only** to requests sending no `x-user-id`. A header-identified caller
> needs `x-user-roles` alongside it — deliberately narrow, because a broader fallback once
> promoted every header-identified e2e request to administrator and turned the refusal assertions
> green for the wrong reason.

## Two identities, which is the whole point

The reporter/maintainer split (D7) only shows up with two callers:

```bash
# reporter — no roles header
curl -s -H 'x-user-id: reporter-1' localhost:3000/api/v1/lifecycle

# maintainer
curl -s -H 'x-user-id: admin-1' -H 'x-user-roles: admin' localhost:3000/api/v1/admin/lifecycle
```

## Walk the primary journey

```bash
R='-H content-type:application/json -H x-user-id:reporter-1'
A='-H content-type:application/json -H x-user-id:admin-1 -H x-user-roles:admin'

# 1. reporter files a report (003 — unchanged by this spec)
curl -s $R -X POST localhost:3000/api/v1/feedback -d '{"message":"grocery rows duplicate"}'

# 2. maintainer sees it queued at `new`, cross-user
curl -s $A localhost:3000/api/v1/admin/lifecycle?stage=new

# 3. GATE 1 — accept
curl -s $A -X PATCH localhost:3000/api/v1/admin/lifecycle/$ID -d '{"action":"accept"}'

# 4. advance to briefed; clauses are drafted from the record
curl -s $A -X PATCH localhost:3000/api/v1/admin/lifecycle/$ID -d '{"action":"advance"}'
curl -s $A localhost:3000/api/v1/admin/lifecycle/$ID/clauses

# 5. vetting is a COMPARISON — each clause shows the record text it came from
curl -s $A -X PATCH localhost:3000/api/v1/admin/lifecycle/$ID/clauses/C-01 -d '{"vetted":"accepted"}'

# 6. advance is REFUSED (409) while any clause is still pending — FR-FL-028
curl -s $A -X PATCH localhost:3000/api/v1/admin/lifecycle/$ID -d '{"action":"advance"}'

# 7. …vet the rest, then advance → in-spec, GATE 2, → in-progress → in-review, GATE 3 → shipped
# 8. close with an excerpt + a release
curl -s $A localhost:3000/api/v1/admin/releases
curl -s $A -X PATCH localhost:3000/api/v1/admin/lifecycle/$ID \
     -d '{"action":"close","excerpt":"Duplicate rows no longer appear.","releaseTag":"nextjs-v4.15.0"}'

# 9. the reporter sees the outcome — and only their own
curl -s $R localhost:3000/api/v1/lifecycle
```

## Checks worth doing by hand

These are the ones where the obvious implementation is wrong.

**Reporter isolation through a merge (`FR-FL-019`, D14).** Merge `reporter-2`'s report into
`reporter-1`'s, then read it as `reporter-2`. You must see a **stage and nothing else** — no
title, no text, no reporter. If you can see the target's title, the projection is happening in the
UI instead of on the server.

**403, not 401 (`FR-FL-055`).** Call any `/admin/lifecycle` route as `reporter-1`. A 401 would
trigger the client's refresh-retry and loop.

**Closure with GitHub unreachable (`FR-FL-044`, `SC-FL-008`).** Unset `GITHUB_REPO` or block
egress, then close an item. `GET /admin/releases` must return **200** with `available:false` and a
reason — not an error — and closure must still succeed with free text.

**Erasure detaches, does not delete (`SC-FL-010`, D15).** Erase `reporter-1` mid-flight, then
confirm their item still exists, still advances, and carries no identifying content. **This is the
one that currently fails on `impl/nextjs`** — `account-purge.ts` deletes it (research R4).

**`closed` is terminal (`FR-FL-049`).** Every action against a closed item → 409. A recurrence is
a *new* report that cites it.

## Tests

```bash
npm test                                                     # all Vitest
npm -w packages/client run test -- tests/server/lifecycle.test.ts
npm -w packages/client run test:e2e                          # Playwright (rebuilds .next-e2e)
```

Traps that make these lie (CLAUDE.md §8): `db.ts` reads `MONGODB_URI` at module scope, so import
routes *after* setting it. The rate limiter is module-level state surviving between tests — reset
the key in `beforeEach`. `it.each` expands at collection time, so build matrices at module scope.

**Never run `npm run build` while `next dev` is running** — both use `.next`. `test:e2e` is safe
(separate `.next-e2e`), but bare `npx playwright test` serves a stale build; only `npm run
test:e2e` rebuilds.

## Migration (once, on a database with pre-012 data)

```bash
# maps the single stage that changed: approved → accepted
npm -w packages/client run migrate:lifecycle-stages
```

A one-off admin task, not startup work — a startup migration is invisible when it fails.
