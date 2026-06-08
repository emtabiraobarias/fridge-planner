# Fridge Planner

A meal-planning web app: track fridge/pantry inventory, get AI-powered meal recommendations that prioritise soon-to-expire ingredients, plan meals on a weekly calendar, and generate smart grocery lists.

## Two implementations, one spec

This repository maintains **two long-lived implementations of the same specification** as a deployment hedge — either may ship.

| Branch | Implementation | Frontend | API |
|---|---|---|---|
| [`impl/vite`](../../tree/impl/vite) | React + Vite SPA | Vite 5 (`:5173`) | standalone Express service (`:3001`) |
| [`impl/nextjs`](../../tree/impl/nextjs) | React + Next.js 15 | Next.js App Router (`:3000`) | Express today → Next.js Route Handlers (Phase C-bis) |

Both share one backend data layer (MongoDB + Mongoose), one AI agent (a HoloDeck sidecar running Claude Sonnet), and the same TypeScript + Tailwind stack. The only deliberate divergence is the frontend build/SSR toolchain and the server API mechanism.

## What lives where

`main` is the **shared contract and coordination layer** — it holds the spec, principles, and process docs, but **no application code**. The app code lives on the two `impl/*` branches.

| On `main` (shared) | Per-branch (`impl/*`) |
|---|---|
| [`specs/001-meal-planner/spec.md`](specs/001-meal-planner/spec.md) — the *what*/*why* | `plan.md` — the *how*, incl. each branch's "Stack Realization" |
| [`specs/001-meal-planner/checklists/`](specs/001-meal-planner/checklists/) — shared acceptance criteria | application code (`packages/client`, `packages/server`, `agents/`) |
| [`constitution.md`](constitution.md) — shared principles (stack-agnostic) | `README.md`, `.gitignore`, `CLAUDE.md` |
| [`specs/BRANCHING_STRATEGY.md`](specs/BRANCHING_STRATEGY.md) — the two-impl model | |
| [`ROADMAP_PROGRESS.md`](ROADMAP_PROGRESS.md) — working log + phase tracker | |

**Golden rule:** spec/contract changes are authored on `main` and inherited by both implementations via `git merge main`; implementation work happens on the relevant `impl/*` branch. See [`specs/BRANCHING_STRATEGY.md`](specs/BRANCHING_STRATEGY.md) for the full model and sync conventions.

## Running the app

The runnable app is on the implementation branches (this branch has no code). Pick one and follow its README:

```bash
git checkout impl/nextjs   # or: impl/vite
# then see that branch's README.md for setup, env vars, and dev commands
```

Both are monorepos (`packages/client` + `packages/server` + `agents/meal-recommender`) and run against MongoDB plus the HoloDeck agent sidecar.

## License

See [LICENSE](LICENSE).
