# Quickstart — Administration Capabilities (`impl/nextjs`)

**Branch**: `011-implement` · **Date**: 2026-08-01 · **Spec**: [`spec.md`](spec.md) · **Plan**: [`plan.md`](plan.md)

Manual verification for spec `011`. Everything below runs **without Keycloak** — the dev
auth seam stands in for real tokens. Keycloak is required only to activate the feature
in production (see "Before production" at the end).

---

## 0. Start it

```bash
docker compose up -d mongodb                       # if not already running
cd packages/client && npx next dev --port 3010     # any free port
```

`packages/client/.env.local` (gitignored) supplies the browser session's identity:

```
MONGODB_URI=mongodb://localhost:27017/fridge-planner-admin-demo
AUTH_MODE=dev
AUTH_DEV_USER_ID=demo-admin
AUTH_DEV_ROLES=admin
```

> **Why this exists:** a browser cannot send `x-user-id` / `x-user-roles`, so without it
> every browser request is an unprivileged `anonymous` and the admin screens are
> unreachable by hand. These vars are read **only** on the dev branch of `resolveMode()`,
> which already refuses the dev seam in production (FR-AD-004).
>
> ⚠️ **Do not run `npm run build` while `next dev` is running** — both use `.next` and the
> build will break the running server. (`test:e2e` is safe; it uses `.next-e2e`.)

Two personas for the API checks below:

```bash
ADMIN=()                                     # no headers → env default = admin
USER=(-H 'x-user-id: alice')                 # explicit id → NOT an admin
BASE=http://localhost:3010
```

Seed some cross-user reports to look at:

```bash
docker exec fridge-planner-mongodb-1 mongosh --quiet \
  "mongodb://localhost:27017/fridge-planner-admin-demo" --eval '
const now = new Date();
db.feedbackrecords.insertMany([
 {userId:"alice",status:"complete",type:"bug",title:"Grocery list shows duplicates",affectedArea:"grocery",transcript:[{role:"user",content:"dupes",at:now}],createdAt:now,updatedAt:now},
 {userId:"bob",status:"complete",type:"improvement",title:"Let me reorder meals",affectedArea:"meal-plan",transcript:[{role:"user",content:"reorder",at:now}],createdAt:now,updatedAt:now},
 {userId:"carol",status:"draft",transcript:[{role:"user",content:"expiry off by one",at:now}],createdAt:now,updatedAt:now}]);'
```

---

## AD0 + AD1 — privilege exists and is enforced (US1)

**The point:** before this, *any* signed-in user could promote their own feedback and
sign it all the way to `shipped`.

```bash
# Who am I? (browser-equivalent — no headers)
curl -s $BASE/api/v1/me                                  # → {"userId":"demo-admin","isAdmin":true}
curl -s "${USER[@]}" $BASE/api/v1/me                     # → {"userId":"alice","isAdmin":false}

# The three maintainer actions refuse an ordinary user
curl -s -o /dev/null -w '%{http_code}\n' "${USER[@]}" $BASE/api/v1/admin/feedback   # → 403
```

- [ ] `/api/v1/me` reports `isAdmin:false` for `alice`, `true` for the browser session
- [ ] Promote / pipeline transitions / export return **403** for `alice` — **not 401**
      (401 would send the client into its token-refresh retry loop)
- [ ] Nothing changes on a refusal — re-read the record, the stage has not moved
- [ ] An end user still sees and manages **their own** feedback exactly as before

## AD2 — the maintainer can finally see everyone's reports (US2 + US5)

**The point:** every feedback query was `{userId}`-scoped, so reports were collected and
then hidden from the only person who could act on them.

**In the browser → <http://localhost:3010/admin>**

- [ ] All three reports are listed, each **attributed** to alice / bob / carol
- [ ] The status filter chips (All / Complete / Draft / Reviewed) narrow the list
- [ ] **Promote** appears only on *complete, not-yet-promoted* reports — never on carol's draft
- [ ] Clicking Promote moves it into the pipeline and the badge changes
- [ ] `/feedback` shows an **"Open administration →"** link (admins only)

```bash
curl -s $BASE/api/v1/admin/feedback | jq '.feedback[] | {userId, title}'
curl -s $BASE/api/v1/admin/audit    | jq '.entries[] | {adminUserId, action, subjectUserId}'
```

- [ ] The audit trail shows one entry per admin action, with actor + subject + time
- [ ] `GET /api/v1/admin/audit` is the only verb — there is no way to edit or delete an entry
- [ ] A **refused** action records nothing

## AD3 — read-only support view (US3)

**The point:** "my grocery list is wrong" used to be uninvestigable.

**In the browser:** click a report's **title** on `/admin` → the reporter's kitchen opens.

- [ ] The panel shows their inventory / meal plans / grocery lists with counts
- [ ] **The only button is Close** — no edit, no delete, no stepper
- [ ] The access appears in `/api/v1/admin/audit` as `user.data.view`

```bash
curl -s $BASE/api/v1/admin/users/alice/data | jq '{userId, counts}'
curl -s -o /dev/null -w '%{http_code}\n' "${USER[@]}" $BASE/api/v1/admin/users/alice/data  # → 403
curl -s -o /dev/null -w '%{http_code}\n' -X DELETE $BASE/api/v1/admin/users/alice/data     # → 405
```

## AD4 + AD6 — operational visibility & control (US4 + US7)

```bash
curl -s $BASE/api/health        | jq .     # liveness — UNCHANGED {status, version}
curl -s $BASE/api/health/ready  | jq .     # readiness — per dependency
```

- [ ] `/api/health` is still exactly `{status, version}` (three shipped consumers rely on it)
- [ ] `/api/health/ready` names mongodb / meal-recommender / feedback-agent / recipe-providers
- [ ] Stop Mongo (`docker stop fridge-planner-mongodb-1`) → that entry is not `ok`, overall **503**,
      and the app still answers. Start it again to recover.

```bash
# Kill switch — AI features degrade, they do not error
curl -s -X PATCH $BASE/api/v1/admin/settings -H 'content-type: application/json' \
     -d '{"ai.enabled": false}' | jq .settings
curl -s $BASE/api/v1/admin/usage   | jq .usage        # per-day, per-feature call counts
curl -s -X DELETE "$BASE/api/v1/admin/cache?userId=alice"      # flush one user
curl -s $BASE/api/v1/admin/limits  | jq .buckets      # limiter state
```

- [ ] With `ai.enabled:false`, recommendations still return (popular-recipe fallback), never a 500
- [ ] Usage counts stop rising while the switch is off — a blocked call is an *uncounted* call
- [ ] An **invalid** value is rejected and the previous value stays in force:
      `-d '{"limits.recommendationsPerMinute": -5}'` → **400**
- [ ] Turn it back on: `-d '{"ai.enabled": true}'`

## AD5 — account export & two-phase erasure (US6)

```bash
curl -s $BASE/api/v1/admin/users/alice/export | jq '{userId, collections}'
curl -s -X POST $BASE/api/v1/admin/users/alice/erase   | jq .
curl -s "${USER[@]}" -o /dev/null -w '%{http_code}\n' $BASE/api/v1/inventory   # → 401, account gone
curl -s -X POST $BASE/api/v1/admin/users/alice/restore | jq .
curl -s "${USER[@]}" -o /dev/null -w '%{http_code}\n' $BASE/api/v1/inventory   # → 200 again
```

- [ ] The export lists **all six** user-keyed collections
- [ ] After erase, alice is refused everywhere (401) — but her data still exists, awaiting the window
- [ ] Restore inside the window returns access **and** data intact
- [ ] An administrator cannot erase **themselves** → 409
- [ ] Erasing twice → 409 (the window is not reset)
- [ ] To see the purge: set `purgeAfter` into the past, then `POST /api/v1/admin/users/purge` →
      every user-keyed collection is empty **and** the erase/purge audit entries survive
      (that is what the 90-day-vs-30-day retention margin is for)

---

## Release gate

```bash
npm run lint                                   # 0 warnings
npm test                                       # full unit suite
npm -w packages/client run test:e2e            # incl. e2e/admin.e2e.ts
bash scripts/validate-e2e.sh --no-agent
```

- [x] `tests/server/admin-authorization.test.ts` enumerates **every** admin route × method (SC-AD-001)
      — 17 rows against 14 exported admin methods + the 3 shipped maintainer actions put
      behind the guard. Re-counted 2026-08-07; the numbers still match exactly.
- [x] A test asserts `AUDIT_RETENTION_DAYS > ERASURE_WINDOW_DAYS` from the constants (FR-AD-023)
      — `tests/server/unit/admin-audit.test.ts`
- [x] A test asserts the dev seam cannot confer admin in production (FR-AD-004)
      — `tests/server/unit/auth.test.ts`, `tests/server/unit/auth-principal.test.ts`
- [x] A test asserts a 403 does **not** trigger the client's token refresh (research D3)
      — `tests/services/http.test.ts:151` — one fetch, no token exchange

### The five criteria that are demonstrated rather than unit-asserted (T068a)

Walked 2026-08-07. Each names the artefact that demonstrates it, so a later reader can
re-run the evidence instead of taking this table's word for it.

| Criterion | Demonstrated by | Result |
|---|---|---|
| **SC-AD-002** — a report reaches the maintainer in-app, zero out-of-band relay | `e2e/admin.e2e.ts:16` (user submits → admin sees it, attributed) + smoke §13 | ✅ |
| **SC-AD-004** — purge leaves zero records | `tests/server/admin-accounts.test.ts:173` "leaves ZERO documents in every user-keyed collection" + `:218` audit entry survives | ✅ |
| **SC-AD-005** — readiness names the down dependency, app keeps serving | `tests/server/admin-ops.test.ts:92` (unreachable agent ⇒ 503, request still served) + `tests/components/admin/OpsPanel.test.tsx` renders it as data + smoke §16 | ✅ |
| **SC-AD-006** — kill switch ⇒ zero model calls, journeys still complete | `tests/server/admin-ops.test.ts:165` (fallback, not an error) + `:175` (a blocked call is an uncounted call) + `e2e/admin.e2e.ts:129` pulls the real switch | ✅ |
| **SC-AD-007** — 100% of cross-user accesses audited | `tests/server/admin-user-data.test.ts:143` (records admin + subject), `:152` (records nothing when refused) + smoke §14 | ✅ |

## Before production (manual — CLAUDE.md §15 boundary)

⚠️ **Ship 011 only after the Keycloak role exists.** Today in production every
authenticated user is treated as the maintainer, so *you* can promote/approve/export. The
moment AD1 ships without an `admin` role issued, **nobody** can — including you. End users
are unaffected (FR-AD-006) and it is fixed by assigning the role, but do not discover it live.

1. `https://auth.fridgeplanner.lan` → sign in → select the **`fridge-planner`** realm (not `master`)
2. **Realm roles → Create role** → `admin` → Save
3. **Users →** your user **→ Role mapping → Assign role** → filter *realm roles* → tick `admin`
4. **Sign out and back in** — existing tokens will not carry it
5. Decode the token; confirm `realm_access.roles` contains `admin`.
   **If it lives elsewhere, set `AUTH_ROLES_CLAIM` to that dotted path — no code change.**
6. Leave `AUTH_ADMIN_ROLE` / `AUTH_ROLES_CLAIM` unset to accept the defaults.
   **`AUTH_ALLOW_DEV` must remain absent**, and never set `AUTH_DEV_*` in production.

## Verification log

| Date | Version | Who | Result |
|---|---|---|---|
| 2026-08-04 | 4.12.0 | maintainer | Released. API complete — but **US4, US6 and US7 had no UI at all**: T050/T059/T063 were never built (T063 was ticked in error). Not discovered until the roadmap was reconciled against `tasks.md` on 2026-08-07. |
| 2026-08-07 | *(pending tag)* | Claude | **Residual closed.** OpsPanel/AccountsPanel/SettingsPanel built; T023a–d guard invariants added. Gate green: `lint` 0 warnings · **976 unit** (92 files, 94.09% lines) · **65 e2e** (9 skipped by viewport project) · smoke **49 pass / 0 fail**. Five demonstrated criteria walked — table above. **T002 still open**: needs a real Keycloak token, which cannot be obtained from the repo. |
