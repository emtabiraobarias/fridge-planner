#!/usr/bin/env bash
# sync-impls.sh — propagate the shared contract from `main` into the impl branches.
#
# Conflict-free by construction (see specs/BRANCHING_STRATEGY.md §10): shared files are kept
# byte-identical across branches, and per-branch files never exist on `main`, so `git merge main`
# into an impl branch never conflicts. If a merge DOES conflict, the invariant has broken — the
# script aborts rather than guess at a resolution.
#
# Direction is one-way only: main -> impl/*. It never merges impl -> main (that merge is deferred
# until all migration phases complete; see the merge condition in ROADMAP_PROGRESS.md).
#
# Usage:  bash scripts/sync-impls.sh        (run from a clean working tree)

set -euo pipefail

MAIN="main"
IMPL_BRANCHES=("impl/vite" "impl/nextjs")

if [[ -n "$(git status --porcelain)" ]]; then
  echo "error: working tree not clean — commit or stash first." >&2
  exit 1
fi

START_BRANCH="$(git rev-parse --abbrev-ref HEAD)"
cleanup() { git checkout --quiet "$START_BRANCH" 2>/dev/null || true; }
trap cleanup EXIT

git checkout --quiet "$MAIN"
git pull --ff-only origin "$MAIN"

for b in "${IMPL_BRANCHES[@]}"; do
  echo "── syncing ${MAIN} → ${b} ──"
  git checkout --quiet "$b"
  git pull --ff-only origin "$b" 2>/dev/null || true
  if ! git merge --no-edit "$MAIN"; then
    git merge --abort
    echo "error: unexpected conflict merging ${MAIN} into ${b} — aborted." >&2
    echo "       the conflict-free invariant broke; resolve manually and check whether a" >&2
    echo "       shared file diverged or a per-branch file leaked onto main (BRANCHING_STRATEGY.md §10)." >&2
    exit 1
  fi
  git push origin "$b"
  echo "✓ ${b} synced + pushed"
done

echo "done — both impl branches carry the latest shared contract."
