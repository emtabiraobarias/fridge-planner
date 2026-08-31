#!/usr/bin/env bash
#
# Cut a release tag for the Next.js app — safely.
#
# Why this exists: on 2026-08-23 release 4.14.0 shipped two-month-old code to production.
# `nextjs-v4.14.0` was a LIGHTWEIGHT tag on a commit 139 commits behind `impl/nextjs` and
# older than 4.9.0 — almost certainly `git tag` run from one of the repo's many stale
# worktrees. Everything downstream then worked perfectly and made it worse: CI faithfully
# built that tree, published it as `:4.14.0`, Portainer faithfully pulled and ran it, and
# `/api/health` answered 200 the whole time. No gate in the pipeline looks at WHICH commit a
# release tag points at, so the only signal was `verify-rollout.sh` failing after the fact.
#
# A second near-miss the same day: a replacement tag cut on a HEAD that was 4 commits stale
# silently omitted a merged PR's UI panels — caught only by diffing the trees by hand.
#
# So this script never tags "wherever you happen to be standing". It fetches, resolves the
# target from `origin/impl/nextjs` itself, and refuses to proceed unless the release moves
# strictly forward from the previous one.
#
# Usage:
#   scripts/cut-release.sh 4.15.0                            # the app   -> nextjs-v4.15.0
#   scripts/cut-release.sh --target feedback-agent 1.2.1     #           -> agent-feedback-v1.2.1
#   scripts/cut-release.sh --target meal-agent 1.4.0         #           -> agent-v1.4.0
#   scripts/cut-release.sh 4.15.0 --dry-run                  # every check, create nothing
#
# The agent targets exist because the same failure happened to them, unwatched:
# `agent-feedback-v1.1.0` is tagged on a commit that does NOT contain 1.0.1 — the 4.14.0
# shape exactly — and that image is the known-broken one production still refuses to run.
#
# On success it prints the remaining release steps. It deliberately does NOT bump the pin in
# docker-compose.prod.yml: the image must exist on GHCR before the pin moves, or Portainer's
# poll tries to pull a tag that isn't there yet (docker-compose.prod.yml header, CLAUDE.md §14).
set -uo pipefail

BRANCH='impl/nextjs'
REMOTE='origin'

TARGET_KIND='app'
DRY_RUN=0
VERSION=''
while [ $# -gt 0 ]; do
  case "$1" in
    --target) TARGET_KIND="${2:?--target needs a value}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    *) VERSION="$1"; shift ;;
  esac
done
VERSION="${VERSION:?expected version, e.g. 4.15.0 (no leading v)}"

# Each target is one image with its own tag namespace and its own pin in
# docker-compose.prod.yml. The globs never overlap: `agent-v*` does not match
# `agent-feedback-v…`, because that starts `agent-f`.
case "$TARGET_KIND" in
  app)            PREFIX='nextjs-v';         PIN_VAR='APP_IMAGE';            WORKFLOW='deploy-nextjs.yml' ;;
  feedback-agent) PREFIX='agent-feedback-v'; PIN_VAR='FEEDBACK_AGENT_IMAGE'; WORKFLOW='agent-feedback-image.yml' ;;
  meal-agent)     PREFIX='agent-v';          PIN_VAR='AGENT_IMAGE';          WORKFLOW='agent-image.yml' ;;
  *) printf '\n❌ unknown --target %s (expected app, feedback-agent or meal-agent)\n' "$TARGET_KIND" >&2; exit 1 ;;
esac

TAG="${PREFIX}${VERSION}"

die() { printf '\n❌ %s\n' "$1" >&2; exit 1; }
ok()  { printf '  ✓ %s\n' "$1"; }

# ── 1. Version shape ──────────────────────────────────────────────────────────
# `v4.15.0` would produce the tag `nextjs-vv4.15.0` and an image tagged `v4.15.0`.
case "$VERSION" in
  v*) die "drop the leading 'v' — pass 4.15.0, not $VERSION" ;;
  [0-9]*.[0-9]*.[0-9]*) ;;
  *)  die "'$VERSION' is not MAJOR.MINOR.PATCH" ;;
esac
ok "version shape: $VERSION -> tag $TAG"

# ── 2. Refresh refs FIRST ─────────────────────────────────────────────────────
# Every check below is worthless against stale refs — that is exactly how the 4.14.1
# near-miss happened (a merged PR was invisible locally, so HEAD looked current).
echo "Fetching ${REMOTE}…"
git fetch --quiet --tags --prune --force "$REMOTE" || die "git fetch failed"
ok "refs refreshed from $REMOTE"

# ── 3. The tag must not already exist ─────────────────────────────────────────
# Re-pointing a published tag is never the fix: the pin text in docker-compose.prod.yml
# would not change (so polling sees no new commit) and the host already has that tag
# cached — the floating-`:latest` failure the version pinning exists to prevent. Ship a
# new version instead.
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null \
  && die "$TAG already exists locally. Never re-point a release tag — cut the next version."
if git ls-remote --exit-code --tags "$REMOTE" "refs/tags/$TAG" >/dev/null 2>&1; then
  die "$TAG already exists on $REMOTE. Never re-point a release tag — cut the next version."
fi
ok "$TAG is unused"

# ── 4. Resolve the target from the BRANCH, not from the checkout ──────────────
# This is the fix for the 4.14.0 class of failure: the target cannot be whatever an
# unrelated worktree has checked out, because the working copy is never consulted.
TARGET="$(git rev-parse --verify "$REMOTE/$BRANCH^{commit}" 2>/dev/null)" \
  || die "cannot resolve $REMOTE/$BRANCH"
ok "target: $(git log -1 --format='%h %s' "$TARGET")"

LOCAL_HEAD="$(git rev-parse --verify HEAD 2>/dev/null || echo '')"
if [ -n "$LOCAL_HEAD" ] && [ "$LOCAL_HEAD" != "$TARGET" ]; then
  # Not fatal — you may be standing anywhere — but it must never be silent, because
  # "I tagged what I was looking at" is the assumption that broke 4.14.0.
  printf '  ⚠ your checkout (%s) is NOT the release target; tagging %s HEAD regardless\n' \
    "$(git rev-parse --short HEAD)" "$REMOTE/$BRANCH"
fi

# ── 5. Releases must move strictly forward ────────────────────────────────────
# Picks the highest existing release version below this one and requires the target to
# contain it. 4.14.0 fails here outright: its commit predates 4.13.0, so it was not a
# descendant of the release it claimed to supersede.
PREV_VERSION="$(
  { git tag --list "${PREFIX}*" | sed "s|^${PREFIX}||" | grep -vFx "$VERSION"; echo "$VERSION"; } \
    | grep -v '^$' | sort -V | grep -B1 -Fx "$VERSION" | head -1
)"

if [ -z "$PREV_VERSION" ] || [ "$PREV_VERSION" = "$VERSION" ]; then
  ok "no earlier release tag — skipping the ancestry check"
else
  PREV_TAG="${PREFIX}${PREV_VERSION}"
  git merge-base --is-ancestor "${PREV_TAG}^{commit}" "$TARGET" \
    || die "$TARGET does not contain $PREV_TAG.
     A release must be a descendant of the release it supersedes. This is the exact
     check that 4.14.0 failed — it was tagged on a commit older than 4.13.0.
     You are almost certainly tagging the wrong commit."
  ok "contains $PREV_TAG (release moves forward)"

  [ "$(git rev-parse "${PREV_TAG}^{commit}")" = "$TARGET" ] \
    && die "$TARGET is exactly $PREV_TAG — there is nothing new to release."
fi

# ── 6. Show what is actually shipping ─────────────────────────────────────────
if [ -n "${PREV_TAG:-}" ]; then
  COUNT="$(git rev-list --count "${PREV_TAG}..${TARGET}")"
  printf '\n%s → %s: %s commit(s)\n' "$PREV_TAG" "$TAG" "$COUNT"
  git log --oneline --no-decorate "${PREV_TAG}..${TARGET}" | head -25
  [ "$COUNT" -gt 25 ] && printf '  … and %s more\n' "$((COUNT - 25))"
fi

if [ "$DRY_RUN" -eq 1 ]; then
  printf '\n🔎 --dry-run: every check passed; no tag created.\n'
  exit 0
fi

# ── 7. Tag (ANNOTATED) and push ───────────────────────────────────────────────
# -a is not cosmetic here: a lightweight tag was the visible tell that 4.14.0 had been
# created outside the normal release path, and CI now rejects lightweight release tags.
git tag -a "$TAG" "$TARGET" -m "Release ${VERSION}

Tagged on ${REMOTE}/${BRANCH} @ ${TARGET} by scripts/cut-release.sh." \
  || die "could not create $TAG"
ok "created annotated tag $TAG"

git push "$REMOTE" "$TAG" || die "could not push $TAG (the local tag remains — delete it before retrying)"
ok "pushed $TAG"

cat <<EOF

✅ ${TAG} is pushed. Remaining steps — the ORDER is load-bearing:

  1. Wait for CI green so the image exists on GHCR:
       gh run list --workflow=${WORKFLOW} --limit 1
  2. THEN bump ${PIN_VAR}'s pin in docker-compose.prod.yml to ${VERSION} and merge it
     to ${BRANCH}. That merge is the deploy; Portainer's poll does the rest.
  3. Verify from the LAN — a 200 from /api/health proves nothing:
       scripts/verify-rollout.sh <app version>
     verify-rollout only reads the APP's baked-in version, so it cannot confirm an agent
     rollout. For an agent, exercise the behaviour the new image adds.
EOF
