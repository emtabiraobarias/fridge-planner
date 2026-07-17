# Reference client-side logic — Organic redesign (spec 004)

> The natural-language quick-add parser, expiry labelling, and stepper sizing, captured as **language-neutral pseudocode with worked examples**, so the implementation can be recreated without the original prototype. Companion to [`organic-design-system.md`](organic-design-system.md). These algorithms run **client-side** and produce the exact structured payloads the existing inventory / grocery APIs already accept — they add no new server behaviour.

---

## 1. `parseQuick(text) → parsed item | null` · `parseQuickAll(text) → parsed items[]`

> **Revised by spec 005 (Intelligent Quick-Add Understanding, FR-IQ-001..009).** Spec 005 is now the canonical contract for quick-add parsing; this section is its worked reference. Additions over the original 004 algorithm: explicit storage locations, unit synonyms, expanded expiry vocabulary with year rollover, trailing quantities, comma multi-item input, and per-field **provenance**.

Parses a natural-language phrase (e.g. `"500 grams mince in the freezer use by 20/7"`) into `{ name, quantity, unit, category, location, expiresAt, provenance }`. Returns `null` when there is no usable item name. `parseQuickAll` splits on commas and parses each segment independently, skipping empty and bare-number segments (FR-IQ-006).

**Provenance** (FR-IQ-011/016): each of `quantity, unit, category, location, expiresAt` carries one of `explicit` (read from the text) · `learned` (per-user alias memory) · `assisted` (AI fallback) · `guess` (built-in default). The deterministic parser emits only `explicit`/`guess`; alias and assist layers upgrade `guess` fields later, and **never** downgrade `explicit`. Precedence per field: explicit > learned > assisted > guess.

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

**Unit synonyms → canonical display unit** (FR-IQ-002 — units are display vocabulary, not a server enum). A word recognised as a unit never stays in the name; a word that is not in this table is never treated as a unit:

| Synonyms (lowercased) | canonical |
|---|---|
| `g, gram, grams` | g |
| `kg, kilo, kilos, kilogram, kilograms` | kg |
| `l, litre, litres, liter, liters` | L |
| `ml, millilitre(s), milliliter(s)` | ml |
| `count, x` | count |
| `pcs, piece, pieces` | pcs |
| `pack, packs, packet, packets` | pack |
| `can, cans, tin, tins` | can |
| `bottle, bottles` | bottle |
| `bag(s)` / `dozen` / `bunch` / `jar(s)` / `loaf, loaves` | themselves |

**Storage locations** (FR-IQ-001): `fridge, freezer, pantry` — matched as `in (the) X` / `to (the) X` anywhere in the segment, or a bare location word ending the segment. The phrase is stripped from the name and overrides the category-derived default. Category keywords (e.g. "frozen") are never location phrases.

**Expiry keywords** (FR-IQ-003, case-insensitive): `expires, expire, exp, use by, use-by, best before`.

**Days of week** (index 0 = Sunday): `sunday, monday, tuesday, wednesday, thursday, friday, saturday`. **Month names**: full or ≥3-letter prefix (`july`/`jul`).

### Algorithm

```
parseQuickAll(text):
    return [ parseQuick(seg) for seg in text.split(',') ] minus nulls   # FR-IQ-006

parseQuick(text):
    t = text.trim()
    if t is empty: return null

    # ── 1. expiry clause (FR-IQ-003/004) ──
    # keyword = expires|expire|exp|use by|use-by|best before ; capture 1-2 tokens after it
    #   two-token forms:  "16 july" / "jul 16"       → day+month (rolls to NEXT year if before TODAY)
    #   one-token forms:  today · tomorrow · Nd/Nw · dd/mm (rolls forward if past) · weekday name
    #                     (≥3-char prefix; weekday never resolves to today → next occurrence)
    # resolved → strip exactly the keyword + used token(s); unresolvable → strip NOTHING
    # (clause stays whole in the name — never half-stripped)

    # ── 2. explicit location (FR-IQ-001) ──
    # "in (the) fridge|freezer|pantry" / "to (the) …" anywhere, or bare location word at segment end
    # → location (provenance explicit), phrase stripped from name; else location = category default (guess)

    # ── 3. quantity — leading wins over trailing (FR-IQ-005) ──
    # leading:  ^(number)(unit-word?)  as before, but unit words resolve via the SYNONYM table
    # trailing: "name 2L" · "name x6" · "name 2"  (only when no leading match;
    #           a trailing non-unit word means NO trailing quantity — "tomatoes 2 large" keeps its name)
    # none → quantity 1 count (guess/guess); bare number → unit count stays a guess

    name = collapse-whitespace(rest).trim()
    if name is empty or name is a bare number: return null

    category, location-default = first CAT_GUESS whose regex tests name, else ('Other','fridge')
    return { title-case(name), quantity, unit, category, location, expiresAt as yyyy-mm-dd | null,
             provenance per field: explicit where parsed above, else guess (category is always a guess) }
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

**Spec-005 additions** (same pinned `TODAY = 2026-07-12`; provenance `explicit` unless noted):

| Input | name | qty | unit | category | location | expiresAt | Notes |
|---|---|---|---|---|---|---|---|
| `chicken thighs in the freezer` | Chicken Thighs | 1 | count | Meat | **freezer** | null | location explicit, stripped (FR-IQ-001) |
| `bread in the freezer` | Bread | 1 | count | Grains | **freezer** | null | explicit beats category default |
| `chicken freezer` | Chicken | 1 | count | Meat | freezer | null | bare location at segment end |
| `frozen peas` | Frozen Peas | 1 | count | Frozen | freezer | null | "frozen" is a category keyword, kept in name; location is a *guess* |
| `500 grams mince` | Mince | 500 | **g** | Meat | fridge | null | unit synonym (FR-IQ-002) |
| `3 tins tuna` | Tuna | 3 | **can** | Seafood | fridge | null | tin → can |
| `2 bottles soy sauce` | Soy Sauce | 2 | **bottle** | Condiments | pantry | null | new canonical unit |
| `1 can crushed tomatoes` | Crushed Tomatoes | 1 | can | Produce | fridge | null | container noun as unit |
| `a can of beans` | A Can Of Beans | 1 | count | Other | fridge | null | no leading digit → no unit strip |
| `tomatoes 2 large` | Tomatoes 2 Large | 1 | count | Produce | fridge | null | non-unit trailing word never a unit |
| `yogurt use by tomorrow` | Yogurt | 1 | count | Dairy | fridge | 2026-07-13 | keyword + token (FR-IQ-003) |
| `ham best before friday` | Ham | 1 | count | Other | fridge | 2026-07-17 | |
| `cheese expires today` | Cheese | 1 | count | Dairy | fridge | 2026-07-12 | today allowed (unlike weekdays) |
| `chicken exp 16 july` | Chicken | 1 | count | Meat | fridge | 2026-07-16 | month-name date |
| `beef expires 5 march` | Beef | 1 | count | Meat | fridge | **2027**-03-05 | past day/month → next year (FR-IQ-004) |
| `ham expires 2/1` | Ham | 1 | count | Other | fridge | **2027**-01-02 | dd/mm rollover |
| `cheese expires someday` | Cheese Expires Someday | 1 | count | Dairy | fridge | null | unresolvable → clause kept whole |
| `milk 2L` | Milk | **2** | **L** | Dairy | fridge | null | trailing quantity (FR-IQ-005) |
| `eggs x6` / `6x eggs` | Eggs | 6 | count | Dairy | fridge | null | x-notation |
| `milk 2L, 6 eggs, sourdough` | 3 items | | | | | | `parseQuickAll` (FR-IQ-006); Sourdough → Other |
| `milk,, 12,` | Milk only | 1 | count | Dairy | fridge | null | empty/bare-number segments skipped |

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
grocAdd(text):                             # spec 005: shared parser, multi-item (FR-IQ-006/007)
    for p in parseQuickAll(text):
        add grocery item {
            name:     p.name,
            qty:      p.quantity + (p.unit=='count' ? '' : ' ' + p.unit),
            category: p.category,
            purchased: false, source: ''   # manually added
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
