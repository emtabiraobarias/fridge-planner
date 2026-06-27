# Fridge Planner

A meal-planning web app: track fridge/pantry inventory, get AI-powered meal recommendations that prioritise soon-to-expire ingredients, plan meals on a weekly calendar, and generate smart grocery lists.

> **This README is shared and identical on every branch** (`main`, `impl/vite`, `impl/nextjs`) so it never conflicts on sync. Branch-specific setup and run instructions live in [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md), which exists only on the implementation branches.

## Two implementations, one spec

This repository maintains **two long-lived implementations of the same specification** as a deployment hedge — either may ship.

| Branch | Implementation | Frontend | API |
|---|---|---|---|
| [`impl/vite`](../../tree/impl/vite) | React + Vite SPA | Vite 5 (`:5173`) | standalone Express service (`:3001`) |
| [`impl/nextjs`](../../tree/impl/nextjs) | React + Next.js 15 | Next.js App Router (`:3000`) | Next.js Route Handlers (`:3000`, one process — Express retired in Phase C-bis) |

Both share one backend data layer (MongoDB + Mongoose), one AI agent (a HoloDeck sidecar running Claude Sonnet), and the same TypeScript + Tailwind stack. The only deliberate divergence is the frontend build/SSR toolchain and the server API mechanism.

## What lives where

`main` holds the **shared contract and coordination layer** — the spec, principles, and process docs — and no application code. The runnable app lives on the two `impl/*` branches.

| Shared (authored on `main`, identical on every branch) | Per-branch (only on `impl/*`) |
|---|---|
| [`specs/001-meal-planner/spec.md`](specs/001-meal-planner/spec.md) — the *what*/*why* | `plan.md` — the *how*, incl. each branch's "Stack Realization" |
| [`specs/001-meal-planner/checklists/`](specs/001-meal-planner/checklists/) — shared acceptance criteria | application code (`packages/client`, `agents/`; `packages/server` on `impl/vite`) |
| [`constitution.md`](constitution.md) — shared principles (stack-agnostic) | `docs/DEVELOPMENT.md` — branch setup/run · `CLAUDE.md` |
| [`specs/BRANCHING_STRATEGY.md`](specs/BRANCHING_STRATEGY.md) — the two-impl model + sync runbook | `verification-findings.md` — branch's Phase B/C log |
| [`ROADMAP_PROGRESS.md`](ROADMAP_PROGRESS.md) — working log + phase tracker | |

This README, `.gitignore`, the spec, checklists, and constitution are kept **byte-identical** across all branches so `git merge main` is conflict-free; the per-branch files above never exist on `main`, so they never collide. See [`specs/BRANCHING_STRATEGY.md`](specs/BRANCHING_STRATEGY.md) for the sync model.

**Golden rule:** spec/contract changes are authored on `main` and inherited by both implementations via `git merge main`; implementation work happens on the relevant `impl/*` branch.

## Running the app

The runnable app is on the implementation branches. Check one out, then follow its [`docs/DEVELOPMENT.md`](docs/DEVELOPMENT.md):

```bash
git checkout impl/nextjs   # or: impl/vite
cat docs/DEVELOPMENT.md     # setup, env vars, dev commands for that branch
```

Both run against MongoDB plus the HoloDeck agent sidecar. `impl/vite` is a two-package monorepo (`packages/client` SPA + `packages/server` Express API); `impl/nextjs` is a single Next.js app (`packages/client`) that serves the API from Route Handlers in the same process.

## License

See [LICENSE](LICENSE).
