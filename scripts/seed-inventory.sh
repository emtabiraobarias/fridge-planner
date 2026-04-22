#!/usr/bin/env bash
# seed-inventory.sh
# Seeds the fridge-planner inventory via the local API so the meal recommender
# has realistic data to work with. Requires the server to be running on port 3001.
#
# Usage:
#   bash scripts/seed-inventory.sh                     # seeds as user "test-user-1"
#   bash scripts/seed-inventory.sh my-user-id          # seeds as a specific user (positional)
#   X_USER_ID=alice bash scripts/seed-inventory.sh     # seeds as a specific user (env var)

set -euo pipefail

BASE_URL="http://localhost:3001/api/v1/inventory"
# Positional arg takes priority, then env var, then default
USER_ID="${1:-${X_USER_ID:-test-user-1}}"

TODAY=$(date -u +"%Y-%m-%dT00:00:00Z")

# Helper: date N days from now in ISO-8601 UTC
days_from_now() {
  local n=$1
  # macOS-compatible date arithmetic
  date -u -v+"${n}"d +"%Y-%m-%dT00:00:00Z" 2>/dev/null \
    || date -u -d "+${n} days" +"%Y-%m-%dT00:00:00Z"
}

post_item() {
  local body=$1
  local response
  response=$(curl -s -w "\n%{http_code}" \
    -X POST "$BASE_URL" \
    -H "Content-Type: application/json" \
    -H "X-User-Id: $USER_ID" \
    -d "$body")
  local http_code
  http_code=$(echo "$response" | tail -n1)
  local body_out
  body_out=$(echo "$response" | head -n-1)
  if [[ "$http_code" == "201" ]]; then
    local name
    name=$(echo "$body_out" | grep -o '"name":"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "  [OK] $name"
  else
    echo "  [FAIL] HTTP $http_code — $body_out"
  fi
}

echo ""
echo "Seeding inventory for user: $USER_ID"
echo "Server: $BASE_URL"
echo "---------------------------------------"

echo ""
echo "Produce (with varied expiry dates)..."

post_item "$(cat <<JSON
{
  "name": "Spinach",
  "quantity": 200,
  "unit": "g",
  "category": "Produce",
  "location": "fridge",
  "expiresAt": "$(days_from_now 2)"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Cherry Tomatoes",
  "quantity": 300,
  "unit": "g",
  "category": "Produce",
  "location": "fridge",
  "expiresAt": "$(days_from_now 4)"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Broccoli",
  "quantity": 1,
  "unit": "head",
  "category": "Produce",
  "location": "fridge",
  "expiresAt": "$(days_from_now 3)"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Garlic",
  "quantity": 6,
  "unit": "cloves",
  "category": "Produce",
  "location": "pantry",
  "expiresAt": "$(days_from_now 14)"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Yellow Onion",
  "quantity": 2,
  "unit": "whole",
  "category": "Produce",
  "location": "pantry",
  "expiresAt": "$(days_from_now 21)"
}
JSON
)"

echo ""
echo "Dairy..."

post_item "$(cat <<JSON
{
  "name": "Eggs",
  "quantity": 8,
  "unit": "whole",
  "category": "Dairy",
  "location": "fridge",
  "expiresAt": "$(days_from_now 10)"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Whole Milk",
  "quantity": 500,
  "unit": "ml",
  "category": "Dairy",
  "location": "fridge",
  "expiresAt": "$(days_from_now 5)"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Cheddar Cheese",
  "quantity": 150,
  "unit": "g",
  "category": "Dairy",
  "location": "fridge",
  "expiresAt": "$(days_from_now 12)"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Greek Yogurt",
  "quantity": 400,
  "unit": "g",
  "category": "Dairy",
  "location": "fridge",
  "expiresAt": "$(days_from_now 6)"
}
JSON
)"

echo ""
echo "Meat..."

post_item "$(cat <<JSON
{
  "name": "Chicken Breast",
  "quantity": 600,
  "unit": "g",
  "category": "Meat",
  "location": "fridge",
  "expiresAt": "$(days_from_now 2)"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Ground Beef",
  "quantity": 400,
  "unit": "g",
  "category": "Meat",
  "location": "freezer",
  "expiresAt": "$(days_from_now 30)"
}
JSON
)"

echo ""
echo "Grains..."

post_item "$(cat <<JSON
{
  "name": "Basmati Rice",
  "quantity": 1,
  "unit": "kg",
  "category": "Grains",
  "location": "pantry"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Spaghetti",
  "quantity": 400,
  "unit": "g",
  "category": "Grains",
  "location": "pantry"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Rolled Oats",
  "quantity": 500,
  "unit": "g",
  "category": "Grains",
  "location": "pantry"
}
JSON
)"

echo ""
echo "Pantry staples..."

post_item "$(cat <<JSON
{
  "name": "Canned Diced Tomatoes",
  "quantity": 2,
  "unit": "cans",
  "category": "Pantry",
  "location": "pantry"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Olive Oil",
  "quantity": 500,
  "unit": "ml",
  "category": "Pantry",
  "location": "pantry"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Chicken Stock",
  "quantity": 1,
  "unit": "litre",
  "category": "Pantry",
  "location": "pantry"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Canned Chickpeas",
  "quantity": 1,
  "unit": "can",
  "category": "Pantry",
  "location": "pantry"
}
JSON
)"

echo ""
echo "Condiments..."

post_item "$(cat <<JSON
{
  "name": "Soy Sauce",
  "quantity": 250,
  "unit": "ml",
  "category": "Condiments",
  "location": "fridge"
}
JSON
)"

post_item "$(cat <<JSON
{
  "name": "Dijon Mustard",
  "quantity": 200,
  "unit": "g",
  "category": "Condiments",
  "location": "fridge"
}
JSON
)"

echo ""
echo "---------------------------------------"
echo "Done! Open http://localhost:5173 to see your inventory."
echo "Then hit the Recommendations panel to test the meal recommender."
echo ""
