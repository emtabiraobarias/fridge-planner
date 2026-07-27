#!/usr/bin/env bash
#
# Deploy an approved release to the internal-LAN prod stack, explicitly.
#
# Why this exists: the rollout is supposed to be automatic via Portainer's GitOps polling,
# but on 2026-07-26 the 4.9.0 release did not land. The container WAS being recreated, so
# the redeploy path worked — what did not happen was an image **re-pull**. With a floating
# `:latest`, `docker compose up -d` happily reuses the locally cached image, so the stack
# "redeploys successfully" and prod keeps serving the old version, silently.
#
# This script removes the ambiguity: it asks Portainer to redeploy the git stack with
# `pullImage: true`, so the pull is not optional, then verifies the released version is
# actually being served before reporting success. GitHub Actions cannot do this — Portainer
# is LAN-only — so this runs from a machine on the LAN.
#
# Usage:
#   scripts/deploy-release.sh --check                # read-only: prove auth + show the target
#   scripts/deploy-release.sh 4.10.0                 # redeploy + verify
#   scripts/deploy-release.sh 4.10.0 --no-verify     # redeploy only (not recommended)
#
# Credentials (never committed). Either export them, or put them in a file — default
# ~/.config/fridge-planner/portainer.env, override with PORTAINER_ENV_FILE:
#   PORTAINER_URL=https://portainer.lan:9443
#   PORTAINER_API_KEY=ptr_xxxxxxxx        # Portainer → My account → API tokens
#   PORTAINER_STACK=fridge-planner        # optional, this is the default
#   APP_BASE_URL=https://fridgeplanner.lan:8443   # optional, for the verify step
set -uo pipefail

STACK_DEFAULT='fridge-planner'
ENV_FILE="${PORTAINER_ENV_FILE:-$HOME/.config/fridge-planner/portainer.env}"
# shellcheck source=/dev/null
[ -f "$ENV_FILE" ] && . "$ENV_FILE"

VERSION=''
CHECK_ONLY=0
VERIFY=1
for arg in "$@"; do
  case "$arg" in
    --check) CHECK_ONLY=1 ;;
    --no-verify) VERIFY=0 ;;
    -*) echo "unknown flag: $arg" >&2; exit 2 ;;
    *) VERSION="$arg" ;;
  esac
done

: "${PORTAINER_URL:?set PORTAINER_URL (e.g. https://portainer.lan:9443) in env or $ENV_FILE}"
: "${PORTAINER_API_KEY:?set PORTAINER_API_KEY (Portainer → My account → API tokens) in env or $ENV_FILE}"
STACK="${PORTAINER_STACK:-$STACK_DEFAULT}"
APP_BASE="${APP_BASE_URL:-https://fridgeplanner.lan:8443}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [ "$CHECK_ONLY" -eq 0 ] && [ -z "$VERSION" ]; then
  echo "refusing to deploy without an explicit version (or pass --check)" >&2
  echo "usage: $0 <version>|--check [--no-verify]" >&2
  exit 2
fi

# -k: Portainer and the app edge both use certs from an internal CA.
api() {
  local method="$1" path="$2"; shift 2
  curl -sk --max-time 30 -X "$method" \
    -H "X-API-Key: $PORTAINER_API_KEY" \
    -H 'Content-Type: application/json' \
    "$PORTAINER_URL/api$path" "$@"
}

# jq is not guaranteed on every machine; python3 is, on macOS and the LAN host.
pick() { python3 -c "import json,sys;print(json.load(sys.stdin)$1)" 2>/dev/null; }

echo "→ Portainer: $PORTAINER_URL  stack: $STACK"
stacks="$(api GET /stacks)"
if [ -z "$stacks" ] || [ "${stacks:0:1}" != '[' ]; then
  echo "❌ could not list stacks — check PORTAINER_URL and that the API key is valid." >&2
  echo "   response: ${stacks:0:200}" >&2
  exit 1
fi

idx="$(printf '%s' "$stacks" | python3 -c "
import json,sys
stacks=json.load(sys.stdin)
for i,s in enumerate(stacks):
    if s.get('Name')=='$STACK': print(i); break
" )"
if [ -z "$idx" ]; then
  echo "❌ no stack named '$STACK'. Found: $(printf '%s' "$stacks" | python3 -c "
import json,sys;print(', '.join(s.get('Name','?') for s in json.load(sys.stdin)))")" >&2
  exit 1
fi

stack_id="$(printf '%s' "$stacks" | pick "[$idx]['Id']")"
endpoint_id="$(printf '%s' "$stacks" | pick "[$idx]['EndpointId']")"
git_ref="$(printf '%s' "$stacks" | pick "[$idx].get('GitConfig',{}).get('ReferenceName','')")"
git_url="$(printf '%s' "$stacks" | pick "[$idx].get('GitConfig',{}).get('URL','')")"

echo "  stack id=$stack_id  environment id=$endpoint_id"
echo "  git: ${git_url:-<not a git stack>} ref=${git_ref:-<none>}"

if [ -z "$git_ref" ]; then
  echo "❌ '$STACK' is not a git-backed stack — this script drives the git redeploy endpoint." >&2
  exit 1
fi

if [ "$CHECK_ONLY" -eq 1 ]; then
  echo "✅ --check only: authentication works and the target resolves. Nothing was changed."
  exit 0
fi

echo "→ redeploying with pullImage=true (prune off, volumes untouched)…"
# pullImage:true is the whole point — it is what a plain redeploy skips, leaving the cached
# :latest in place. prune:false so nothing is removed; named volumes are never touched.
body="$(python3 -c "
import json
print(json.dumps({'pullImage': True, 'prune': False, 'repositoryReferenceName': '$git_ref'}))")"
resp="$(api PUT "/stacks/$stack_id/git/redeploy?endpointId=$endpoint_id" -d "$body" -w '\n%{http_code}')"
code="$(printf '%s' "$resp" | tail -n1)"

if [ "$code" != "200" ]; then
  echo "❌ redeploy failed (HTTP $code)." >&2
  echo "   response: $(printf '%s' "$resp" | head -n1 | cut -c1-400)" >&2
  echo "   Fallback: Portainer → Stacks → $STACK → Pull and redeploy (leave 'Remove volumes' OFF)." >&2
  exit 1
fi
echo "  redeploy accepted (HTTP 200)"

if [ "$VERIFY" -eq 0 ]; then
  echo "⚠ skipping verification (--no-verify). Confirm with: scripts/verify-rollout.sh $VERSION"
  exit 0
fi

echo "→ verifying the served version is $VERSION…"
exec "$HERE/verify-rollout.sh" "$VERSION" "$APP_BASE" 10
