# Reference client-side logic — Organic redesign (spec 004)

> The natural-language quick-add parser, expiry labelling, and stepper sizing, captured as **language-neutral pseudocode with worked examples**, so the implementation can be recreated without the original prototype. Companion to [`organic-design-system.md`](organic-design-system.md). These algorithms run **client-side** and produce the exact structured payloads the existing inventory / grocery APIs already accept — they add no new server behaviour.

---

## 1. `parseQuick(text) → parsed item | null`

Parses a natural-language phrase (e.g. `"2L milk expires friday"`) into `{ name, quantity, unit, category, location, expiresAt }`. Returns `null` when there is no usable item name.

### Constants

**Category/location guessing** — first matching keyword-regex wins (case-insensitive). Order matters (dairy/egg before produce, etc.):

| Keyword pattern (regex, `i`) | category | location |
|---|---|---|
| `milk\|yogurt\|yoghurt\|cheese\|butter\|cream\|feta\|egg` | Dairy | fridge |
| `chicken\|beef\|pork\|mince\|lamb\|bacon\|sausage` | Meat | fridge |
| `salmon\|fish\|prawn\|shrimp\|tuna` | Seafood | fridge |
| `spinach\|tomato\|lettuce\|apple\|banana\|carrot\|cucumber\|lemon\|onion\|garlic\|capsicum\|broccoli\|potato\|avocado\|berr` | Produce | fridge |
| `rice\|pasta\|bread\|oat\|flour\|noodle\|quinoa` | Grains | pantry |
| `frozen\|ice cream\|peas` | Frozen | freezer |
| `oil\|sauce\|ketchup\|mayo\|mustard\|vinegar\|honey\|jam` | Condiments | pantry |

Default when nothing matches: category `Other`, location `fridge`.

**Recognised units** (lowercased): `kg, g, l, ml, count, x, pcs, pack, bag, can, dozen, bunch, jar, loaf`. A recognised `l` is normalised to display `L`.

**Days of week** (index 0 = Sunday): `sunday, monday, tuesday, wednesday, thursday, friday, saturday`.

### Algorithm

```
parseQuick(text):
    t = text.trim()
    if t is empty: return null
    expiresAt = null

    # ── expiry: "expires <token>" / "exp <token>" ──
    expMatch = match  \b(?:exp(?:ires)?)\s+([a-z0-9/]+)\b   (case-insensitive) on t
    if expMatch:
        token = lowercase(expMatch.group1)
        if token matches ^(\d+)\s*(d|w)$:              # relative: "3d", "2w"
            n, unitChar = groups
            expiresAt = TODAY + n * (7 if unitChar=='w' else 1) days
        else if token matches ^\d{1,2}/\d{1,2}$:        # "16/7" = dd/mm (current year)
            dd, mm = token.split('/')
            expiresAt = date(currentYear, mm, dd)
        else:                                           # weekday name (prefix match, ≥3 chars)
            dowIdx = index of day-of-week whose name startsWith token[0:3]
            if dowIdx found and len(token) >= 3:
                diff = (dowIdx - TODAY.weekday + 7) mod 7
                if diff == 0: diff = 7                   # never today → next occurrence
                expiresAt = TODAY + diff days
        if expiresAt set: remove expMatch text from t, trim

    # ── leading quantity + optional unit: "2L milk", "500 g mince", "6 eggs" ──
    quantity = 1 ; unit = 'count'
    qtyMatch = match  ^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+  on t
    if qtyMatch:
        quantity = number(qtyMatch.group1)
        u = lowercase(qtyMatch.group2 or '')
        if u is a recognised unit:
            unit = ('L' if u=='l' else u)
            t = t after qtyMatch
        else if u is empty:                              # bare number, e.g. "6 eggs"
            t = t after qtyMatch
        else:                                            # group2 is the item word, not a unit
            t = t after just the number, trim            # keep the word as part of the name

    name = collapse-whitespace(t).trim()
    if name is empty: return null

    category, location = first CAT_GUESS whose regex tests name, else ('Other','fridge')
    prettyName = title-case each word of name           # \b\w → uppercase

    return {
        name: prettyName, quantity, unit, category, location,
        expiresAt: expiresAt ? ISO date (yyyy-mm-dd) : null
    }
```

> **`TODAY`**: use the real current date at local midnight in production. (The prototype pinned `TODAY = 2026-07-12` so its screenshots were deterministic; the worked examples below use that pin.)

### Worked examples (with `TODAY = 2026-07-12`, a Sunday)

> The examples below are computed against that pinned date so they are reproducible in tests; a test harness should inject a fixed `TODAY`. (`getDay()` for a Sunday is `0`, so "friday" = index 5 → `diff = (5 − 0 + 7) mod 7 = 5` → 2026-07-17.)

| Input | name | qty | unit | category | location | expiresAt |
|---|---|---|---|---|---|---|
| `2L milk expires friday` | Milk | 2 | L | Dairy | fridge | 2026-07-17 (next Fri) |
| `500g mince` | Mince | 500 | g | Meat | fridge | null |
| `6 eggs` | Eggs | 6 | count | Dairy | fridge | null |
| `spinach exp 3d` | Spinach | 1 | count | Produce | fridge | 2026-07-15 |
| `chicken thighs expires 16/7` | Chicken Thighs | 1 | count | Meat | fridge | 2026-07-16 |
| `2 kg jasmine rice` | Jasmine Rice | 2 | kg | Grains | pantry | null |
| `olive oil` | Olive Oil | 1 | count | Condiments | pantry | null |
| `` (empty) | — | — | — | — | — | returns `null` |
| `12` (number only) | — | — | — | — | — | returns `null` (no name) |

---

## 2. `daysLeft(iso) → integer | null` and `expiryText(dl) → string`

```
daysLeft(iso):
    if iso is null: return null
    return round( (date(iso at midnight) - TODAY) / one_day )

expiryText(dl):
    if dl is null:  return 'no expiry'
    if dl < 0:      return 'expired ' + abs(dl) + (abs(dl)==1 ? ' day ago' : ' days ago')
    if dl == 0:     return 'expires today'
    if dl == 1:     return 'expires tomorrow'
    if dl <= 14:    return 'expires in ' + dl + ' days'
    return 'fresh for weeks'
```

**Urgency buckets** (drive the status dot + use-soon strip):
- **expired**: `dl != null && dl < 0` → dot `accent-600`, expiry text colour `accent-700`.
- **expiring soon (urgent)**: `dl != null && 0 <= dl <= 2` → dot `accent-400`, text `accent-600`; included in the use-soon strip and the Kitchen tab badge.
- **fresh** (incl. no-expiry): otherwise → dot `accent2-500`, text `accent2-700`.

**Sort order for the list:** ascending by `daysLeft`, treating `null` as `+∞` (no-expiry items last).

**Use-soon pill relative label:** `dl==0 → 'today'`, `dl==1 → 'tomorrow'`, else `dl + ' days'`.

**Preview expiry tag format:** locale short weekday+day+month, e.g. `expires Fri 17 Jul` (from `expiresAt`).

---

## 3. `stepFor(item) → number` (quantity stepper)

```
stepFor(item):
    if item.unit in {g, ml}:  return 50
    if item.unit in {kg, L}:  return 0.5
    return 1
```

Increment: `quantity = round((quantity + step) * 100) / 100`.
Decrement: `quantity = max(0, round((quantity - step) * 100) / 100)`; if the result is `0`, **remove the item**.

---

## 4. Placement flow (tap-to-place)

```
# entering placement (from "Plan it" / "Place on calendar")
placing = { name: meal.name, time: meal.time }
navigate to Meal plan screen

# an empty slot is a click target only while `placing` is set
onEmptySlotClick(dayOfWeek, slotType):
    if not placing: ignore
    schedule meal into (dayOfWeek, slotType) via the existing meal-plan entries endpoint
    placing = null
    toast(meal.name + ' planned for ' + dayOfWeek + ' ' + slotType)

onCancel(): placing = null      # no change to the plan
```

Filled slots are never placement targets. A filled slot's × clears that entry (existing delete-entry endpoint).

---

## 5. Grocery quick-add + checkout

```
grocAdd(text):
    p = parseQuick(text)
    add grocery item {
        name:     p ? p.name : text,
        qty:      p ? (p.quantity + (p.unit=='count' ? '' : ' ' + p.unit)) : '1',
        category: p ? p.category : 'Other',
        purchased: false, source: ''       # manually added
    }

completeShopping():                        # the inline "Done shopping" button
    bought = grocery items where purchased == true
    remove bought from the grocery list
    for each b in bought:
        p = parseQuick(b.qty + ' ' + b.name)  or  { quantity:1, unit:'count', location:'fridge' }
        add inventory item { name: b.name, quantity: p.quantity, unit: p.unit,
                             category: b.category, location: p.location, expiresAt: null }
    toast(bought.length + ' items moved into your kitchen')
```

> In the real app these map onto the existing grocery `items` / `complete` and inventory `POST` endpoints — the client computes the structured payloads; the server contract is unchanged. Where the existing `POST /grocery-lists/:weekStart/complete` already performs inventory consumption/movement server-side, prefer the existing endpoint's behaviour over re-implementing the movement on the client; the pseudocode above documents the *intended user-visible outcome*.

---

## 6. Toast

```
showToast(msg):
    toast = msg
    clear any pending dismiss timer
    after ~2600ms: toast = ''      # single global toast; a new message replaces the old
```
