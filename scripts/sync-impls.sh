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
# Usage:  bash scripts/sync-impls.sh [--dry-run]
#
# WORKTREE-AWARE (rewritten 2026-08-24). The original version ran `git checkout` in whatever
# worktree you invoked it from. That failed three syncs in a row on the real repo, for two
# reasons that are structural rather than accidental:
#
#   1. An impl branch that is checked out in ANOTHER worktree cannot be checked out again —
#      `git checkout impl/nextjs` dies with "already used by worktree at …". Because the loop
#      pushed `impl/vite` BEFORE reaching `impl/nextjs`, the failure published a PARTIAL sync
#      and left the repo on whichever branch it died on.
#   2. The cleanliness guard covered the INVOKING worktree, which is exactly the one most likely
#      to be dirty — a running `next dev` rewrites `packages/client/next-env.d.ts` continuously.
#      And checking out `main` there would have deleted `packages/` underneath the dev server,
#      since `main` has no `packages/` at all (disjoint history).
#
# So this version never checks anything out in the caller's worktree. For each branch it either
# reuses the worktree that already has it, or creates a throwaway one. The caller's branch,
# working tree, and running processes are untouched — only the TARGET worktree must be clean.
set -euo pipefail

MAIN="main"
REMOTE="origin"
IMPL_BRANCHES=("impl/vite" "impl/nextjs")

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

TEMP_WORKTREES=()
cleanup() {
  for wt in "${TEMP_WORKTREES[@]:-}"; do
    [ -n "$wt" ] && git worktree remove --force "$wt" >/dev/null 2>&1 || true
  done
}
trap cleanup EXIT

die() { printf '\nerror: %s\n' "$1" >&2; exit 1; }

# Path of the worktree holding $1, or empty if the branch is not checked out anywhere.
worktree_for() {
  git worktree list --porcelain | awk -v want="refs/heads/$1" '
    /^worktree /{ wt = substr($0, 10) }
    /^branch /  { if (substr($0, 8) == want) { print wt; exit } }'
}

# ── Bring `main` up to date without checking it out ───────────────────────────
# `git fetch <remote> main:main` fast-forwards the local ref with no working tree involved.
# It refuses if the update is not a fast-forward, which is the correct outcome: `main` having
# diverged locally is a real problem, not something to paper over. If `main` happens to be
# checked out somewhere, fetch cannot write its ref, so pull inside that worktree instead.
echo "Updating ${MAIN}…"
MAIN_WT="$(worktree_for "$MAIN")"
if [ -n "$MAIN_WT" ]; then
  git -C "$MAIN_WT" pull --ff-only "$REMOTE" "$MAIN" \
    || die "could not fast-forward ${MAIN} in ${MAIN_WT}"
else
  git fetch "$REMOTE" "${MAIN}:${MAIN}" || die "could not fast-forward ${MAIN}"
fi
git fetch --quiet "$REMOTE"

# ── Sync each impl branch in its own worktree ─────────────────────────────────
for b in "${IMPL_BRANCHES[@]}"; do
  echo "── syncing ${MAIN} → ${b} ──"

  wt="$(worktree_for "$b")"
  if [ -n "$wt" ]; then
    echo "   using existing worktree: ${wt}"
  else
    wt="$(mktemp -d "${TMPDIR:-/tmp}/sync-impls-${b//\//-}.XXXXXX")"
    rmdir "$wt"                      # git worktree add wants a non-existent path
    git worktree add --quiet "$wt" "$b" || die "could not create a worktree for ${b}"
    TEMP_WORKTREES+=("$wt")
    echo "   created temporary worktree: ${wt}"
  fi

  # Only the TARGET worktree must be clean — the caller's is irrelevant now.
  if [ -n "$(git -C "$wt" status --porcelain)" ]; then
    die "worktree for ${b} is not clean: ${wt}
       commit or stash there first. (A running dev server rewriting a generated file is the
       usual cause — see packages/client/next-env.d.ts.)"
  fi

  # Catch the branch up to its remote first. --ff-only is deliberate: if the local branch has
  # unpushed commits this stops, rather than building a sync merge on a stale base.
  git -C "$wt" merge --ff-only "${REMOTE}/${b}" >/dev/null 2>&1 || true

  if [ "$DRY_RUN" -eq 1 ]; then
    ahead="$(git -C "$wt" rev-list --count "${b}..${MAIN}")"
    echo "   --dry-run: ${ahead} commit(s) would merge into ${b}; nothing done"
    continue
  fi

  if ! git -C "$wt" merge --no-edit "$MAIN"; then
    git -C "$wt" merge --abort || true
    die "unexpected conflict merging ${MAIN} into ${b} — aborted.
       the conflict-free invariant broke; resolve manually and check whether a shared file
       diverged or a per-branch file leaked onto main (BRANCHING_STRATEGY.md §10)."
  fi

  git -C "$wt" push "$REMOTE" "$b" || die "could not push ${b}"
  echo "✓ ${b} synced + pushed"
done

if [ "$DRY_RUN" -eq 1 ]; then
  echo "done — dry run, nothing pushed."
else
  echo "done — both impl branches carry the latest shared contract."
fi
