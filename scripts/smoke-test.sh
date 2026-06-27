#!/usr/bin/env bash
#
# Shared end-to-end API smoke test — the user journeys from
# specs/001-meal-planner/checklists/acceptance-scenarios.md encoded as live API
# calls against a RUNNING stack. It validates the integrated, running system
# (real server + real MongoDB) — the part the in-process unit/handler suites can't.
#
# SHARED CONTRACT TEST (lives on `main`, synced to both impls). Both impl/vite and
# impl/nextjs expose the same /api/v1 contract, so the steps are identical — only the
# BASE url and how the stack boots differ. Each impl wraps this with its own
# scripts/validate-e2e.sh (per-branch boot).
#
# Usage:
#   BASE=http://localhost:3000/api/v1 bash scripts/smoke-test.sh            # full (incl. live agent)
#   bash scripts/smoke-test.sh --no-agent                                   # deterministic core only
#
# Env / flags:
#   BASE        API base URL          (default http://localhost:3000/api/v1)
#   SMOKE_USER  X-User-Id header      (default smoke-user)
#   AGENT=0     or  --no-agent        skip the non-deterministic live-agent step (step 8)
#
set -u
BASE="${BASE:-http://localhost:3000/api/v1}"
# Note: NOT named USER — that's the ubiquitous shell login-name env var and would clobber the default.
U="${SMOKE_USER:-smoke-user}"
AGENT="${AGENT:-1}"
for a in "$@"; do [ "$a" = "--no-agent" ] && AGENT=0; done

WEEK="2026-06-29T00:00:00.000Z"
WEEK_ENC="2026-06-29T00%3A00%3A00.000Z"
SLOT="11111111-2222-3333-4444-555555555555"
pass=0; fail=0
chk() { if [ "$2" = "$3" ]; then echo "  ✓ $1 ($3)"; pass=$((pass+1)); else echo "  ✗ $1 expected=$2 got=$3"; fail=$((fail+1)); fi; }
code() { curl -s -o /tmp/smoke-body.json -w "%{http_code}" --max-time 30 "$@"; }
field() { node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{process.stdout.write(String(eval('('+s+')')$1))}catch{process.stdout.write('?')}})" < /tmp/smoke-body.json; }

echo "BASE=$BASE  USER=$U  AGENT=$AGENT"

echo "1) POST inventory (create Chicken Breast x3) — US1"
c=$(code -X POST -H "X-User-Id: $U" -H "Content-Type: application/json" \
  -d '{"name":"Chicken Breast","quantity":3,"unit":"lbs","category":"Meat","location":"fridge"}' "$BASE/inventory")
chk "201 Created" 201 "$c"
ID=$(field ._id)
echo "   id=$ID  expirationStatus=$(field .expirationStatus)"

echo "2) GET inventory"
c=$(code -H "X-User-Id: $U" "$BASE/inventory"); chk "200 OK" 200 "$c"
echo "   total=$(field .summary.total)"

echo "3) POST meal-plan entry (uses Chicken Breast -> consumes) — US4 / FR-005"
c=$(code -X POST -H "X-User-Id: $U" -H "Content-Type: application/json" \
  -d "{\"slotId\":\"$SLOT\",\"date\":\"$WEEK\",\"mealType\":\"dinner\",\"meal\":{\"mealName\":\"Chicken Dinner\",\"suggestedMealType\":\"dinner\",\"prepTimeMinutes\":20,\"cuisine\":\"American\",\"description\":\"x\",\"usesIngredients\":[\"Chicken Breast\"],\"expiringIngredients\":[],\"missingIngredients\":[\"rice\"]}}" \
  "$BASE/meal-plans/$WEEK_ENC/entries")
chk "201 Created" 201 "$c"

echo "4) GET inventory -> Chicken Breast consumed to qty 2"
code -H "X-User-Id: $U" "$BASE/inventory" >/dev/null
QTY=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);const i=b.items.find(x=>x.name==='Chicken Breast');process.stdout.write(String(i?i.quantity:'none'))})" < /tmp/smoke-body.json)
chk "consumed to qty 2" 2 "$QTY"

echo "5) GET grocery-list (lazy-generate from meal plan) — US3"
c=$(code -H "X-User-Id: $U" "$BASE/grocery-lists/$WEEK_ENC"); chk "200 OK" 200 "$c"
echo "   items=$(field '.groceryList?.items.length')"

echo "6) GET meal-plans?weekStart"
c=$(code -H "X-User-Id: $U" "$BASE/meal-plans?weekStart=$WEEK_ENC"); chk "200 OK" 200 "$c"
echo "   entries=$(field '.plan?.entries.length')"

echo "7) POST recommendations as EMPTY user -> popular fallback (no agent) — EC-01"
c=$(code -X POST -H "X-User-Id: smoke-empty" -H "Content-Type: application/json" -d '{}' "$BASE/recommendations")
chk "200 OK" 200 "$c"
echo "   fallback=$(field .fallback)"

if [ "$AGENT" = "1" ]; then
  echo "8) POST recommendations with inventory -> LIVE agent (200; real result or graceful fallback) — US2 / EC-08"
  c=$(code -X POST -H "X-User-Id: $U" -H "Content-Type: application/json" -d '{}' --max-time 220 "$BASE/recommendations")
  chk "200 OK" 200 "$c"
  echo "   fallback=$(field '.fallback||"(none — real agent result)"')  count=$(field .recommendations.length)"
else
  echo "8) [skipped — --no-agent]"
fi

echo "9) DELETE inventory item -> 204"
c=$(code -X DELETE -H "X-User-Id: $U" "$BASE/inventory/$ID"); chk "204 No Content" 204 "$c"

echo "10) PUT bad ObjectId -> 400 Problem JSON"
c=$(code -X PUT -H "X-User-Id: $U" -H "Content-Type: application/json" -d '{"quantity":1}' "$BASE/inventory/not-an-id")
chk "400 Bad Request" 400 "$c"

echo ""
echo "RESULT: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
