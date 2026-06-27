#!/usr/bin/env bash
#
# One-shot E2E validation for impl/nextjs.
#
# Boots the REAL stack — a production build (`next build` + `next start`), a real
# MongoDB (throwaway DB), and optionally the live Holodeck agent — runs the shared
# scripts/smoke-test.sh against it, then tears everything down. Exit code = smoke result.
#
# This is the per-branch BOOT WRAPPER. The smoke STEPS live in the shared
# scripts/smoke-test.sh (on main). impl/vite has its own validate-e2e.sh that boots
# Express + the SPA and points BASE at :3001 instead.
#
# Use as a RELEASE GATE for major version changes / impl->main merges.
#
# Usage:
#   bash scripts/validate-e2e.sh              # full, incl. live Holodeck agent
#   bash scripts/validate-e2e.sh --no-agent   # deterministic core only (no Holodeck needed)
#
set -uo pipefail
cd "$(dirname "$0")/.."
DB="fridge-planner-e2e"
PORT=3000
AGENT_FLAG="${1:-}"
APP_PID=""

mongo() { docker compose exec -T mongodb mongosh --quiet --eval "$1" 2>/dev/null; }
cleanup() {
  [ -n "$APP_PID" ] && kill "$APP_PID" 2>/dev/null
  mongo "db.getSiblingDB('$DB').dropDatabase()" >/dev/null 2>&1 || true
}
trap cleanup EXIT

WANT_AGENT=1; [ "$AGENT_FLAG" = "--no-agent" ] && WANT_AGENT=0

echo "[1/4] start infra (MongoDB$([ "$WANT_AGENT" = 1 ] && echo ' + Holodeck'))"
docker compose up -d mongodb >/dev/null
[ "$WANT_AGENT" = 1 ] && docker compose up -d holodeck >/dev/null
for _ in $(seq 1 30); do mongo 'db.adminCommand("ping")' | grep -q 'ok' && break; sleep 1; done

echo "[2/4] production build (next build)"
npm -w packages/client run build || { echo "❌ build failed"; exit 1; }

echo "[3/4] start (next start) on :$PORT against $DB"
MONGODB_URI="mongodb://localhost:27017/$DB" HOLODECK_URL="http://localhost:8001" \
  npm -w packages/client run start >/tmp/e2e-app.log 2>&1 &
APP_PID=$!
ready=0
for _ in $(seq 1 60); do
  curl -sf -o /dev/null -H "X-User-Id: _probe" "http://localhost:$PORT/api/v1/inventory" && { ready=1; break; }
  sleep 1
done
[ "$ready" = 1 ] || { echo "❌ app did not become ready (see /tmp/e2e-app.log)"; exit 1; }

echo "[4/4] run shared smoke (scripts/smoke-test.sh)"
BASE="http://localhost:$PORT/api/v1" bash scripts/smoke-test.sh $AGENT_FLAG
RC=$?

echo ""
[ "$RC" -eq 0 ] && echo "✅ E2E validation PASSED" || echo "❌ E2E validation FAILED (app log: /tmp/e2e-app.log)"
exit "$RC"
