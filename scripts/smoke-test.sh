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
#   --require-admin                   FAIL (don't skip) if the spec-011 admin surface is absent.
#                                     impl/nextjs passes this from its validate-e2e.sh; impl/vite
#                                     does not implement spec 011, so there the steps auto-skip.
#
set -u
BASE="${BASE:-http://localhost:3000/api/v1}"
# Note: NOT named USER — that's the ubiquitous shell login-name env var and would clobber the default.
U="${SMOKE_USER:-smoke-user}"
AGENT="${AGENT:-1}"
REQUIRE_ADMIN="${REQUIRE_ADMIN:-0}"
for a in "$@"; do
  [ "$a" = "--no-agent" ] && AGENT=0
  [ "$a" = "--require-admin" ] && REQUIRE_ADMIN=1
done
# Spec 011 personas. The gate boots with the dev auth seam (AUTH_MODE=dev), so an
# EXPLICIT X-User-Roles header decides privilege — and an explicit empty one is what
# makes the "ordinary user" persona unambiguous even if the host env defaults to admin.
ADMIN_U="${SMOKE_ADMIN:-smoke-admin}"
OTHER_U="${SMOKE_OTHER:-smoke-other}"

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

echo "3) POST meal-plan entry (planning is inventory-neutral) — US4 / FR-005 rev. spec 006 FR-MC-006"
c=$(code -X POST -H "X-User-Id: $U" -H "Content-Type: application/json" \
  -d "{\"slotId\":\"$SLOT\",\"date\":\"$WEEK\",\"mealType\":\"dinner\",\"meal\":{\"mealName\":\"Chicken Dinner\",\"suggestedMealType\":\"dinner\",\"prepTimeMinutes\":20,\"cuisine\":\"American\",\"description\":\"x\",\"usesIngredients\":[\"Chicken Breast\"],\"expiringIngredients\":[],\"missingIngredients\":[\"rice\"]}}" \
  "$BASE/meal-plans/$WEEK_ENC/entries")
chk "201 Created" 201 "$c"
code -H "X-User-Id: $U" "$BASE/inventory" >/dev/null
QTY=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);const i=b.items.find(x=>x.name==='Chicken Breast');process.stdout.write(String(i?i.quantity:'none'))})" < /tmp/smoke-body.json)
chk "planning left qty 3 (FR-MC-006)" 3 "$QTY"

echo "4) PATCH cook (confirmed 1 lbs) -> Chicken Breast deducted to qty 2 — spec 006 FR-MC-008/009"
c=$(code -X PATCH -H "X-User-Id: $U" -H "Content-Type: application/json" \
  -d "{\"action\":\"cook\",\"consumption\":[{\"inventoryItemId\":\"$ID\",\"name\":\"Chicken Breast\",\"quantity\":1,\"unit\":\"lbs\"}]}" \
  "$BASE/meal-plans/$WEEK_ENC/entries/$SLOT")
chk "200 OK" 200 "$c"
code -H "X-User-Id: $U" "$BASE/inventory" >/dev/null
QTY=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);const i=b.items.find(x=>x.name==='Chicken Breast');process.stdout.write(String(i?i.quantity:'none'))})" < /tmp/smoke-body.json)
chk "cooked to qty 2" 2 "$QTY"

echo "5) GET grocery-list (lazy-generate from meal plan) — US3"
c=$(code -H "X-User-Id: $U" "$BASE/grocery-lists/$WEEK_ENC"); chk "200 OK" 200 "$c"
echo "   items=$(field '.groceryList?.items.length')"

echo "5b) POST grocery-list complete -> remaining receipt-less lines enter inventory — spec 007 FR-GC-011"
# The cooked entry (step 4) is excluded from generation (spec 006 planned-only), so the lazy
# list is empty — seed a manual, receipt-less line for checkout to add.
c=$(code -X POST -H "X-User-Id: $U" -H "Content-Type: application/json" \
  -d '{"displayName":"Rice","quantity":1,"unit":"servings","category":"Pantry"}' \
  "$BASE/grocery-lists/$WEEK_ENC/items")
chk "manual Rice line added (201)" 201 "$c"
c=$(code -X POST -H "X-User-Id: $U" -H "Content-Type: application/json" -d '{}' "$BASE/grocery-lists/$WEEK_ENC/complete")
chk "200 OK" 200 "$c"
chk "checkout has no errors" 0 "$(field .errors.length)"
code -H "X-User-Id: $U" "$BASE/inventory" >/dev/null
HAS_RICE=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);process.stdout.write(String((b.items||[]).some(x=>x.name==='Rice')));})" < /tmp/smoke-body.json)
chk "checkout added Rice once" true "$HAS_RICE"

echo "6) GET meal-plans?weekStart"
c=$(code -H "X-User-Id: $U" "$BASE/meal-plans?weekStart=$WEEK_ENC"); chk "200 OK" 200 "$c"
echo "   entries=$(field '.plan?.entries.length')"

echo "7) POST recommendations as EMPTY user -> popular fallback (no agent) — EC-01"
c=$(code -X POST -H "X-User-Id: smoke-empty" -H "Content-Type: application/json" -d '{}' "$BASE/recommendations")
chk "200 OK" 200 "$c"
chk "every fallback meal carries recipeUrl (FR-037)" true "$(field '.recommendations.every(m=>!!m.recipeUrl)')"
echo "   fallback=$(field .fallback)"

if [ "$AGENT" = "1" ]; then
  # FR-037 (async revision): the results endpoint returns immediately (no link
  # blocking); links are fetched via the follow-up verify-links endpoint. With a
  # recipe-search key configured the follow-up reports available=true; without,
  # available=false (the CLIENT then removes unlinked meals + shows a notice).
  echo "8) POST recommendations with inventory -> LIVE agent, immediate results (FR-037) — US2 / EC-08"
  c=$(code -X POST -H "X-User-Id: $U" -H "Content-Type: application/json" -d '{}' --max-time 220 "$BASE/recommendations")
  chk "200 OK" 200 "$c"
  echo "   fallback=$(field '.fallback||"(none — real agent result)"')  count=$(field .recommendations.length)"
  names=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);process.stdout.write(JSON.stringify((b.recommendations||[]).map(m=>m.mealName).slice(0,10)))})" < /tmp/smoke-body.json)
  echo "8b) POST recommendations/verify-links (FR-037 lazy phase)"
  c=$(code -X POST -H "X-User-Id: $U" -H "Content-Type: application/json" -d "{\"mealNames\":$names}" --max-time 120 "$BASE/recommendations/verify-links")
  chk "200 OK" 200 "$c"
  # The app's provider keys aren't visible from this shell, so assert internal
  # consistency instead of guessing: available must be a boolean, and when it is
  # false the links map must be empty.
  avail=$(field .available)
  case "$avail" in
    true)  chk "verification available (app has a provider key)" true "$avail" ;;
    false) chk "unavailable → zero links" 0 "$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);process.stdout.write(String(Object.keys(b.links||{}).length))})" < /tmp/smoke-body.json)" ;;
    *)     chk "available flag is boolean" "true|false" "$avail" ;;
  esac
  echo "   links=$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);process.stdout.write(String(Object.keys(b.links||{}).length))})" < /tmp/smoke-body.json)"
else
  echo "8) [skipped — --no-agent]"
fi

echo "9) DELETE inventory item -> 204"
c=$(code -X DELETE -H "X-User-Id: $U" "$BASE/inventory/$ID"); chk "204 No Content" 204 "$c"

echo "10) PUT bad ObjectId -> 400 Problem JSON"
c=$(code -X PUT -H "X-User-Id: $U" -H "Content-Type: application/json" -d '{"quantity":1}' "$BASE/inventory/not-an-id")
chk "400 Bad Request" 400 "$c"


# ─── Spec 011: administration through the ADMIN ROLE (FR-AD-001..030) ───────────
#
# These verify the thing unit tests structurally cannot: that on a REAL running stack,
# privilege is decided by the role a caller presents — not by which UI they opened.
# Every call below hits the API directly.
#
# `-H "X-User-Roles;"` sends an EMPTY header (curl's syntax for a valueless header),
# which the server parses to "no roles". That is deliberate rather than omitting the
# header: an omitted header can inherit an AUTH_DEV_ROLES default, and a refusal test
# that silently runs as an administrator passes for the wrong reason.
AS_ADMIN=(-H "X-User-Id: $ADMIN_U" -H "X-User-Roles: admin")
AS_USER=(-H "X-User-Id: $U" -H "X-User-Roles;")

echo "11) GET /me — does this build implement spec 011?"
c=$(code "${AS_ADMIN[@]}" "$BASE/me")
if [ "$c" = "404" ] && [ "$REQUIRE_ADMIN" = "0" ]; then
  echo "   [skipped — no admin surface on this implementation (impl/vite); pass --require-admin to make this fatal]"
else
  chk "200 OK" 200 "$c"
  chk "admin role → isAdmin true (FR-AD-001)" true "$(field .isAdmin)"
  c=$(code "${AS_USER[@]}" "$BASE/me")
  chk "no role → isAdmin false" false "$(field .isAdmin)"

  echo "12) admin-only routes refuse an ordinary user with 403 — NOT 401 (FR-AD-003, SC-AD-001)"
  # 403 vs 401 is load-bearing: the client treats 401 as its FR-D-010 refresh-and-retry
  # trigger, so answering 401 here would burn a refresh on a request that can never work.
  # `admin/lifecycle` replaced the `promote` probe below it. That route was removed once its
  # deprecation window closed, and the capability it guarded — accepting a report into the
  # lifecycle — is now `PATCH /admin/lifecycle/:id {action:'accept'}` (012 FR-FL-008, and
  # 011 FR-AD-010 redirects to it). The 012 admin surface had no smoke coverage before this.
  for path in "admin/feedback" "admin/audit" "admin/settings" "admin/usage" "admin/limits" "admin/users/$U/data" "admin/users/$U/export" "admin/lifecycle"; do
    chk "403 $path" 403 "$(code "${AS_USER[@]}" "$BASE/$path")"
  done
  chk "403 lifecycle action (FR-FL-055 / FR-AD-010)" 403 "$(code -X PATCH "${AS_USER[@]}" -H "Content-Type: application/json" -d '{"action":"accept"}' "$BASE/admin/lifecycle/000000000000000000000000")"

  echo "13) cross-user feedback triage (FR-AD-009) — the defect this feature exists to fix"
  c=$(code -X POST -H "X-User-Id: $OTHER_U" -H "X-User-Roles;" -H "Content-Type: application/json" \
    -d '{"message":"smoke: grocery count looks wrong"}' "$BASE/feedback")
  # 502 = the feedback agent isn't running in this gate; the draft is still persisted
  # (FR-F-002), which is all this step needs.
  case "$c" in 200|201|502) chk "report filed by another user" "ok" "ok" ;; *) chk "report filed by another user" "200|201|502" "$c" ;; esac
  c=$(code "${AS_ADMIN[@]}" "$BASE/admin/feedback"); chk "200 OK" 200 "$c"
  chk "admin sees the other user's report, attributed" true \
    "$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);process.stdout.write(String((b.feedback||[]).some(f=>f.userId==='$OTHER_U')))})" < /tmp/smoke-body.json)"
  c=$(code "${AS_USER[@]}" "$BASE/feedback"); chk "200 OK" 200 "$c"
  chk "an end user sees ONLY their own (FR-AD-008 unchanged)" false \
    "$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);process.stdout.write(String((b.feedback||[]).some(f=>f.userId==='$OTHER_U')))})" < /tmp/smoke-body.json)"

  echo "14) every cross-user access is audited (FR-AD-021/022)"
  c=$(code "${AS_ADMIN[@]}" "$BASE/admin/audit"); chk "200 OK" 200 "$c"
  chk "audit records the acting admin" true \
    "$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);process.stdout.write(String((b.entries||[]).some(e=>e.adminUserId==='$ADMIN_U')))})" < /tmp/smoke-body.json)"
  chk "audit is append-only — no write verb (FR-AD-022)" 405 "$(code -X DELETE "${AS_ADMIN[@]}" "$BASE/admin/audit")"

  echo "15) support view is READ-ONLY (FR-AD-015)"
  c=$(code "${AS_ADMIN[@]}" "$BASE/admin/users/$U/data"); chk "200 OK" 200 "$c"
  chk "no write verb on the support path" 405 "$(code -X DELETE "${AS_ADMIN[@]}" "$BASE/admin/users/$U/data")"

  echo "16) readiness is a SIBLING of liveness (FR-AD-022/024)"
  RB="${BASE%/api/v1}"
  c=$(code "$RB/api/health"); chk "200 OK" 200 "$c"
  # /api/health must stay exactly {status,version} — the Docker healthcheck,
  # verify-rollout.sh and this gate all depend on its shape.
  chk "liveness shape unchanged" "status,version" \
    "$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{process.stdout.write(Object.keys(JSON.parse(s)).sort().join(','))})" < /tmp/smoke-body.json)"
  c=$(code "$RB/api/health/ready")
  case "$c" in 200|503) chk "readiness answers" "ok" "ok" ;; *) chk "readiness answers" "200|503" "$c" ;; esac
  chk "readiness names its dependencies" true \
    "$(node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const b=JSON.parse(s);process.stdout.write(String((b.dependencies||[]).length>=3))})" < /tmp/smoke-body.json)"

  echo "17) runtime settings — defaults from code, invalid rejected (FR-AD-030)"
  c=$(code "${AS_ADMIN[@]}" "$BASE/admin/settings"); chk "200 OK" 200 "$c"
  BEFORE=$(field '.settings["limits.recommendationsPerMinute"]')
  c=$(code -X PATCH "${AS_ADMIN[@]}" -H "Content-Type: application/json" \
    -d '{"limits.recommendationsPerMinute":-5}' "$BASE/admin/settings")
  chk "invalid value rejected" 400 "$c"
  code "${AS_ADMIN[@]}" "$BASE/admin/settings" >/dev/null
  chk "prior value still in force" "$BEFORE" "$(field '.settings["limits.recommendationsPerMinute"]')"

  echo "18) erasure is two-phase and REVERSIBLE (FR-AD-018/019)"
  # Deliberately erase-then-restore a throwaway user and never purge, so the gate
  # leaves no wreckage behind.
  c=$(code -X POST "${AS_ADMIN[@]}" "$BASE/admin/users/$OTHER_U/erase"); chk "200 OK" 200 "$c"
  chk "erased user is refused everywhere (401)" 401 "$(code -H "X-User-Id: $OTHER_U" -H "X-User-Roles;" "$BASE/inventory")"
  c=$(code -X POST "${AS_ADMIN[@]}" "$BASE/admin/users/$OTHER_U/restore"); chk "200 OK" 200 "$c"
  chk "restored user has access again" 200 "$(code -H "X-User-Id: $OTHER_U" -H "X-User-Roles;" "$BASE/inventory")"
  chk "admin cannot erase themselves (FR-AD-020)" 409 "$(code -X POST "${AS_ADMIN[@]}" "$BASE/admin/users/$ADMIN_U/erase")"

  echo "19) spec 013 — the account routes (FR-AC-018/023/029/044)"
  # The SIGNED-OUT pair must be reachable without a session: someone registering has no
  # account, and someone resetting a password cannot sign in. That is the whole audience,
  # and FR-AC-029 exists because every other route in this app assumes a session — an entry
  # point built behind one is the easy accident.
  #
  # 401 here would mean unreachable. Anything else means reachable: 400 for a body the gate
  # deliberately does not supply, 429 if a previous run used the window, 503 where no
  # identity provider is configured (which is the case on a bare Stage-1 stack).
  c=$(code -X POST -H "Content-Type: application/json" -d '{}' "$BASE/accounts/register")
  case "$c" in 401) chk "register is reachable signed out (FR-AC-029)" "not 401" "$c" ;;
                 *) chk "register is reachable signed out (FR-AC-029)" "ok" "ok" ;; esac

  # Password reset answers 202 whether or not the address is registered (FR-AC-023). A gate
  # that accepted "any non-401" would miss the disclosure this requirement is entirely about,
  # so this one pins the exact status for an address that certainly does not exist.
  chk "password reset is 202 for an unknown address (FR-AC-023)" 202 \
    "$(code -X POST -H "Content-Type: application/json" \
       -d '{"email":"definitely-not-registered@example.invalid"}' "$BASE/accounts/password-reset")"

  # …and the SIGNED-IN ones answer for the CALLER, never 500.
  #
  # This gate runs under the dev auth seam, where every request is authenticated — so there
  # is no unauthenticated state here to assert a 401 against. What it CAN pin is the failure
  # that actually happened three times while spec 013 was built: `Account.findById` THROWS on
  # an id that is not an ObjectId rather than returning null, and EVERY userId in a live
  # database is a provider subject until the migration runs. A 500 here on deploy day would
  # mean the account surface was broken for every existing user at once.
  chk "own account answers 404, not 500, for an identity with no account row" 404 \
    "$(code -H "X-User-Id: smoke-no-such-account" "$BASE/accounts/me")"
  chk "own export answers 404, not 500, for the same (FR-AC-024)" 404 \
    "$(code -H "X-User-Id: smoke-no-such-account" "$BASE/accounts/me/export")"
  chk "own deletion answers 404, not 500, for the same (FR-AC-025)" 404 \
    "$(code -X DELETE -H "X-User-Id: smoke-no-such-account" "$BASE/accounts/me")"
fi

echo ""
echo "RESULT: pass=$pass fail=$fail"
[ "$fail" -eq 0 ]
