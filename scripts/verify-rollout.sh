#!/usr/bin/env bash
#
# Verify a release actually reached the running deployment.
#
# Why this exists: on 2026-07-27 the spec-010 release sat unrolled in Portainer for over a
# day. `GET /api/health` returned `{"status":"ok"}` the whole time — from the OLD container.
# The stall was noticed only by luck, because that release happened to add a new route that
# 404'd. `/api/health` now also reports the version baked into the image at build time, so
# "did the rollout land?" is a question with a real answer instead of a guess.
#
# Usage:
#   scripts/verify-rollout.sh 4.10.0                          # against the default LAN host
#   scripts/verify-rollout.sh 4.10.0 https://host:8443        # explicit base URL
#   scripts/verify-rollout.sh 4.10.0 https://host:8443 20     # wait up to 20 minutes
#
# Exits 0 as soon as the expected version is being served; 1 on timeout (with the causes
# worth checking first). Run it from the LAN — GitHub Actions cannot reach the internal host,
# which is exactly why this is a local script and not a CI step.
set -uo pipefail

EXPECT="${1:?expected version, e.g. 4.10.0 (no leading v)}"
BASE="${2:-https://fridgeplanner.lan:8443}"
WAIT_MIN="${3:-15}"

# -k: the Stage-1 edge uses Caddy's internal CA, which curl will not trust by default.
CURL=(curl -sk --max-time 10)

observed() { "${CURL[@]}" "$BASE/api/health" | sed -n 's/.*"version" *: *"\([^"]*\)".*/\1/p'; }

deadline=$(( $(date +%s) + WAIT_MIN * 60 ))
echo "Waiting for $BASE to serve version $EXPECT (up to ${WAIT_MIN}m)…"

while :; do
  got="$(observed)"
  if [ "$got" = "$EXPECT" ]; then
    echo "✅ rolled: $BASE is serving $EXPECT ($(date '+%H:%M:%S'))"
    exit 0
  fi

  if [ -z "$got" ]; then
    # No version field at all means something older than this change is serving — which is
    # itself the answer on the first release after it, but a real signal on later ones.
    echo "  $(date '+%H:%M:%S') no version reported (pre-$EXPECT image, or app not reachable)"
  else
    echo "  $(date '+%H:%M:%S') serving $got, want $EXPECT"
  fi

  if [ "$(date +%s)" -ge "$deadline" ]; then
    cat <<EOF

❌ NOT ROLLED after ${WAIT_MIN}m — $BASE is still serving "${got:-unknown}", not $EXPECT.

Check these first (see ROADMAP_PROGRESS.md backlog #14):
  1. Are the GHCR packages pullable by Portainer? All three are PRIVATE, so a lapsed
     credential makes every re-pull fail SILENTLY while the old container keeps serving.
     Portainer -> the app container -> logs/events, look for "unauthorized" / "denied".
  2. Is the stack's auto-update still enabled, polling, with force-update/re-pull on?
     A floating :latest means the compose text never changes, so without re-pull there is
     nothing for Portainer to notice.
  3. Is APP_IMAGE pinned to an older version in the stack env? (Pinning is the documented
     rollback mechanism — it must be unpinned for polling to pick releases up.)
Manual fallback: Portainer -> Stacks -> fridge-planner -> Pull and redeploy.
EOF
    exit 1
  fi
  sleep 30
done
