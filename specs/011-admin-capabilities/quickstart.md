# Quickstart — Administration Capabilities (`impl/nextjs`)

**Branch**: `011-implement` · **Date**: 2026-08-01 · **Spec**: [`spec.md`](spec.md) · **Plan**: [`plan.md`](plan.md)

Manual verification for spec `011`. Run locally in `dev` auth mode, where `X-User-Id` + `X-User-Roles` stand in for real tokens (Research D2). The verification log at the bottom must be filled before a release tag.

## Setup

```bash
docker compose up -d mongodb holodeck holodeck-feedback
npm run dev                     # :3000
```

Two personas, via the dev seam:

```bash
USER=(-H 'x-user-id: user-a')                              # ordinary end user
ADMIN=(-H 'x-user-id: admin-1' -H 'x-user-roles: admin')   # administrator
```

> **The seam is dev-only.** In production `AUTH_MODE=oidc` and `resolveMode()` refuses the seam, so `x-user-roles` cannot confer privilege there (FR-AD-004). Verified by test, not by inspection.

## AD0/AD1 — privilege exists and is enforced (US1)

```bash
# End user attempts the three maintainer actions → expect 403 (NOT 401) each time
curl -si -X POST localhost:3000/api/v1/feedback/$FID/promote "${USER[@]}"     | head -1
curl -si -X PATCH localhost:3000/api/v1/pipeline/$PID -d '{"action":"approve-release"}' \
     -H 'content-type: application/json' "${USER[@]}"                         | head -1
curl -si localhost:3000/api/v1/feedback/$FID/export "${USER[@]}"              | head -1

# Same calls as admin → succeed
curl -si -X POST localhost:3000/api/v1/feedback/$FID/promote "${ADMIN[@]}"    | head -1
```

- [ ] All three refuse for the end user with **403** (not 401 — 401 would trigger the client's refresh-retry loop)
- [ ] All three succeed for the admin
- [ ] No state changed on any refusal (re-`GET` the record — stage unmoved)
- [ ] `promotedBy` on the new pipeline item is **`admin-1`**, not the record's author (FR-AD-012)
- [ ] An end user still sees and manages **their own** feedback exactly as before (FR-AD-007/008)
- [ ] Ordinary features (kitchen, plan, grocery) behave identically for both personas (FR-AD-005)

## AD2 — cross-user triage + audit (US2, US5)

Submit feedback as `user-a` and `user-b`, then:

```bash
curl -s localhost:3000/api/v1/admin/feedback "${ADMIN[@]}" | jq '.records[].userId' | sort -u
curl -s localhost:3000/api/v1/feedback "${USER[@]}"        | jq '.records[].userId' | sort -u
```

- [ ] Admin list contains **both** users' records, each attributed to its author (FR-AD-009)
- [ ] End-user list contains **only** `user-a` (FR-AD-008 — unchanged)
- [ ] A record containing instruction-like text renders as inert data and changes nothing (FR-AD-014)
- [ ] `GET /admin/audit` shows one entry per admin action, with acting admin + subject + time (FR-AD-021)
- [ ] The audit log offers **no** write or delete verb (FR-AD-022)

## AD3 — support view (US3)

- [ ] `GET /admin/users/user-a/data` returns that user's inventory, plans, grocery lists (FR-AD-015)
- [ ] No write verb exists on the path (FR-AD-015)
- [ ] The access appears in the audit log (FR-AD-021)
- [ ] The same request as an end user → **403** (FR-AD-016)

## AD4 — operational visibility (US4)

```bash
curl -s localhost:3000/api/health        | jq .   # unchanged: {status, version}
curl -s localhost:3000/api/health/ready  | jq .
docker compose stop holodeck
curl -s localhost:3000/api/health/ready  | jq '.dependencies'
```

- [ ] `/api/health` is **byte-identical** to before — still `{status, version}`, still fast, still no dependency checks (Research D8; `scripts/verify-rollout.sh` depends on it)
- [ ] `/api/health/ready` names each dependency and the overall state (FR-AD-024)
- [ ] With the agent stopped: that dependency reports unhealthy, readiness reflects it, **the app still serves requests** (FR-AD-024)
- [ ] A slow dependency reports *degraded* rather than hanging (FR-AD-025)
- [ ] Kill switch on (`PATCH /admin/settings {"ai.enabled": false}`) → recommendations make **zero** model calls and return the existing fallback, not an error (FR-AD-026)
- [ ] `GET /admin/usage` shows per-feature call counts; they stop rising while the switch is off (FR-AD-027)
- [ ] `DELETE /admin/cache?userId=user-a` → next request recomputes (FR-AD-028)
- [ ] `GET /admin/limits` shows state; `DELETE /admin/limits/:key` clears a bucket (FR-AD-029)

## AD5 — accounts (US6)

- [ ] `GET /admin/users/user-a/export` contains data from **all six** collections (FR-AD-017)
- [ ] `POST .../erase` → `user-a` is immediately refused, and disappears from every admin surface incl. the support view (FR-AD-018)
- [ ] `POST .../restore` inside the window → everything returns intact (FR-AD-019)
- [ ] After the window, restore returns **410 Gone** — an explicit refusal, never a silent success (FR-AD-019)
- [ ] After purge: **zero** documents keyed to that user across all six collections (FR-AD-018)
- [ ] The erasure's **audit entry survives** the purge (FR-AD-023 — the 90-vs-30-day margin)
- [ ] Erasing the last administrator is refused (FR-AD-020)

## AD6 — runtime config (US7)

- [ ] Changing an approved recipe domain / fallback set / limit takes effect **without a redeploy** (FR-AD-030)
- [ ] An invalid value is rejected and the prior value stays in force (FR-AD-030)
- [ ] With the settings collection **empty**, behaviour is identical to today (FR-AD-030 — code-owned defaults)

## Release gate

```bash
npm run lint                                   # 0 warnings
npm test                                       # full suite green
npm -w packages/client run test:e2e            # incl. e2e/admin.e2e.ts (CLAUDE.md §8)
bash scripts/validate-e2e.sh --no-agent        # deterministic gate
```

- [ ] `tests/server/admin-authorization.test.ts` enumerates **every** admin route × method and asserts 403 for a non-admin (SC-AD-001 — this is the evidence for "100%")
- [ ] A test asserts `AUDIT_TTL_DAYS > ERASURE_WINDOW_DAYS` from the constants (FR-AD-023)
- [ ] A test asserts the dev seam cannot confer admin in production (FR-AD-004)
- [ ] A test asserts a non-admin 403 does **not** trigger the client's token refresh (Research D3)

## Deployment cascade (manual — CLAUDE.md §15 boundary)

- [ ] Keycloak: create the `admin` realm role and assign it to the operator — **one-time, human-only**, not automatable from the repo
- [ ] Confirm the role appears in the access token at the configured claim path before relying on it
- [ ] New env vars documented in `.env.example` + `docs/deployment.md`: `AUTH_ADMIN_ROLE`, `AUTH_ROLES_CLAIM`
- [ ] Confirm `AUTH_ALLOW_DEV` remains absent from every production surface

## Verification log

| Date | Version | Who | Result |
|---|---|---|---|
| _(fill before tagging)_ | | | |
