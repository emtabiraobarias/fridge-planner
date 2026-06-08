# Verification Findings — `impl/vite`

> **Per-branch log** (React + Vite 5 SPA; client `:5173`, Express API `:3001`).
> Branch-specific — kept with `--ours` on `git merge main`; never lives on `main`.
>
> Walk the shared checklist [`checklists/acceptance-scenarios.md`](checklists/acceptance-scenarios.md)
> against the running app and record results here by **scenario ID**.
>
> **Routing (see ROADMAP "Phase B/C/D — both-implementation tracking"):**
> - **spec-gap** (no scenario/FR) → fix `spec.md` on `main`; add to the shared checklist; log in main's spec-gap register.
> - **frontend bug** → fix here on `impl/vite`.
> - **backend bug** (`packages/server`) → fix here **and** cherry-pick to `impl/nextjs` (Express is duplicated on both).
>
> Status legend: ☐ to-do · ◐ in progress · ☑ pass · ✗ fail (open) · ✔ fixed.

## How to run (this branch)

```bash
docker compose up mongodb -d        # + holodeck for recommendations
npm run dev                         # Express :3001 + Vite :5173
# open http://localhost:5173
```

## Phase B — verification results

| Scenario ID | Area | Result | Type (bug/spec-gap) | Fix location | Notes |
|-------------|------|--------|---------------------|--------------|-------|
| _(none yet — populate during Phase B; e.g. `US1-S4`)_ | | ☐ | | | |

## Open bugs (this branch)

| # | Scenario ID(s) | Description | Severity | Status |
|---|----------------|-------------|----------|--------|
| _(none yet)_ | | | | |

## Spec-gaps raised from this branch

Cross-reference; the authoritative register is in `ROADMAP_PROGRESS.md` on `main`.

| Scenario gap | Raised | Description | Status |
|--------------|--------|-------------|--------|
| _(none yet)_ | | | |
