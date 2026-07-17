# Organic Design System — canonical reference (spec 004)

> This file is the **canonical, self-contained** visual specification for the Organic UI redesign (Phase G / spec `004`). It carries every token, per-screen layout, copy string, and state rule needed to build the redesign without any external handoff. Companion: [`reference-logic.md`](reference-logic.md) holds the client-side algorithms (parser, expiry labelling, stepper). Fidelity is **high**: colours, type, spacing, radii, and copy are final — recreate pixel-accurately with the app's existing styling approach (Tailwind + a global stylesheet).

---

## 1. Design tokens

Add colour/type/radius/shadow tokens to `packages/client/tailwind.config.ts` (`theme.extend`) and expose the same values as CSS custom properties in the global stylesheet so non-Tailwind rules can reference them. Load fonts via the framework's font mechanism (Next: `next/font/google`).

### Colours

| Role | Value |
|---|---|
| `bg` (page ground) | `#f5ead8` |
| `surface` (cards/rows) | `#ebddc5` |
| `text` | `#201e1d` |
| `accent` (terracotta) | `#c67139` |
| `accent2` (sage) | `#7a8a5e` |
| Divider | `color-mix(in srgb, #201e1d 16%, transparent)` (≈ `rgba(32,30,29,0.16)`) |
| Muted text | 55% opacity of `text` |

**Accent (terracotta) ramp 100→900:** `#fff2eb` `#ffe1d0` `#ffc6a5` `#f6a06b` `#d67f48` `#b2622d` `#8c491a` `#643312` `#402310`

**Accent2 (sage) ramp 100→900:** `#f0fae1` `#e1eecc` `#ccdbb2` `#aebf92` `#8fa073` `#728157` `#56633f` `#3d472b` `#272e1b`

**Neutral ramp 100→900:** `#f9f4ed` `#eee7db` `#dcd3c4` `#c0b6a5` `#a19786` `#82796a` `#645c50` `#474238` `#2e2b25`

> Note `accent-500` in the base ramp above is `#d67f48`, while the base `accent` token is `#c67139`. Use the base `accent` token for primary fills; use ramp steps for hover/tint math (hover = one step darker, e.g. `accent-600` on a light ground).

### Typography

- **Headings:** Caprasimo 400, line-height 1.12, letter-spacing −0.015em. Scale: h1 42 / h2 32 / h3 25 / h4 20 / h5 16 / h6 13. h6 is uppercase, letter-spacing 0.08em.
- **Body:** Figtree, 15px base, line-height 1.55. Weights 400 / 600 / 700.

### Radii

`sm` 8px · `md` 16px · `lg` 28px · pills/buttons/inputs/tags/segmented-controls `9999px`.

### Shadows

- `sm` `0 1px 2px rgba(46,43,37,0.14)`
- `md` `0 3px 10px rgba(46,43,37,0.16)`
- `lg` `0 12px 32px rgba(46,43,37,0.22)`

### Icons

Single stroke icon set (Lucide — `lucide-react` is the natural fit), **stroke-width 2.75 everywhere**. Icons used: `refrigerator`, `calendar`, `shopping-cart`, `message-circle`, `clock`, `sparkles`, `trash-2`, `refresh-cw`, `check`, plus glyph `+` / `−` / `×`. No raster images.

### Interaction states

- **Hover:** one ramp step past base (e.g. terracotta button → `accent-600`).
- **Focus:** `outline: 2px solid #c67139; outline-offset: 2px` via `:focus-visible` — never the browser default blue ring. (`:focus { outline: none }` paired with the `:focus-visible` rule.)
- **Selection:** 30% accent tint (`::selection`).
- **Disabled:** 45% opacity.
- **Links (global):** `a { color: accent }`, `a:hover { color: accent-600 }`.
- All transitions ~150ms ease on background; the only other animations are progress-bar width (0.3s) transitions. No entrance animations.

### Component classes (from the design-system stylesheet, for reference)

The original design system expressed these as plain-CSS classes; reproduce their *values* with Tailwind utilities or a small set of `@layer components` classes. Key ones:

- `.btn` base + `.btn-primary` (terracotta fill, cream text; hover accent-600; active accent-700), `.btn-secondary` (divider border; hover 7% ink tint), `.btn-ghost` (terracotta text; hover 10% accent tint), `.btn-icon` (34px square), `.btn-block` (full width).
- `.input` — surface bg, divider border, pill radius, 14px, terracotta caret; hover darkens border; focus-visible = terracotta border.
- `.seg` / `.seg-opt` — pill container of radio options; selected option gets a terracotta fill; hover 7% ink tint; focus-visible outline offset −2px.
- `.tag` + variants: `.tag-accent` (accent-100 bg / accent-800 text), `.tag-accent-2` (sage-100 / sage-800), `.tag-neutral` (neutral-100 / neutral-800), `.tag-outline` (accent border + text).
- `.card` — surface bg, lg radius, column flex; `.card-kicker` (10px uppercase accent), `.card-title` (17px display), `.card-body` (13px, 0.8 opacity), `.card-meta` (11px, 50% ink). Elevation helpers `.elev-sm/md/lg`.
- Rounding override: cards/dialogs use `radius-lg × 1.15`; buttons/tags/segs/inputs are fully pill (`999px`).

---

## 2. Global shell

`app/layout.tsx` + `app/nav.tsx` (+ the global stylesheet `src/index.css`).

- **Page:** `min-height: 100vh; background: #f5ead8; padding-bottom: 96px` (clearance for the bottom nav). Content container: `max-width: 1160px`, horizontal padding 28px.
- **Header** (top of page, no border, transparent on cream): brand mark = 40px circle, `background: #c67139`, containing a white fridge icon (`refrigerator`, 21px, stroke 2.75) next to "Fridge Planner" in Caprasimo 22px.
- **Navigation = bottom tab bar** (`app/nav.tsx`): `position: fixed; bottom: 18px; left: 50%; transform: translateX(-50%)`, `background: #2e2b25` (neutral-900), `border-radius: 9999px; padding: 7px`, shadow-lg, `z-index: 40`, `display: flex; gap: 4px`.
  - Tabs: Kitchen `refrigerator` → `/`; Meal plan `calendar` → `/calendar`; Groceries `shopping-cart` → `/grocery`; Feedback `message-circle` → `/feedback`. Icon 16px + label.
  - Tab style: pill, `padding: 10px 18px`, 13px Figtree 600. **Active:** `background: #c67139; color: #f5ead8`. **Inactive:** transparent, `color: #dcd3c4` (neutral-300); hover: 12% white tint bg, white text.
  - Preserve active-route logic + `aria-current`.
  - **Label renames:** Inventory→**Kitchen**, Meal Plan→**Meal plan**, Grocery List→**Groceries**. Feedback unchanged.
  - Kitchen tab shows a count badge when ≥1 item is urgent (expiring within 2 days): a small pill, min-width 18px, 11px 700; active tab → cream bg / accent-700 text, inactive → accent bg / cream text.

---

## 3. Screens

### 3.1 Kitchen (Inventory) — `src/views/InventoryPage.tsx`

Two-column grid `1fr 400px`, gap 28px (single column below ~900px). **Left column** stacks (gap 20px): use-soon strip → smart quick-add card → location filter row → item list. **Right column**: recommendations panel.

**Use-soon strip** (visible only when any item expires within 2 days; replaces the old summary chips):
- Row, `background: #fff2eb` (accent-100), radius 28px, padding 12px 18px. `clock` icon (accent-700, 18px), bold 13px "Use soon:" in accent-800, then one cream pill per urgent item (`background: #f5ead8`, text accent-800): e.g. "Baby Spinach · tomorrow". Right-aligned ghost button "Cook these →" scrolls to the recommendations panel.

**Smart quick-add** (replaces `src/components/inventory/InventoryForm.tsx`):
- Card: `background: #ebddc5`, radius 28px, padding ~24px, shadow-sm. Heading h4 "Add to your kitchen" + muted 12px "type it like you'd say it".
- Input row: pill input (radius 9999px, min-height 46px, 15px text, `background: #f9f4ed`) with a terracotta `sparkles` icon inside on the left (padding-left 40px); placeholder `2L milk expires friday · 500g mince · 6 eggs…`. Solid terracotta "Add" pill button beside it (min-height 46px).
- **Live parse preview** below while typing: muted 12px "I'll add:" then tags — name (accent tag, 600), quantity (neutral tag), "Category · location" (sage tag), and if an expiry was parsed an accent-200/accent-800 tag "expires Fri 17 Jul".
- **Staple chips:** muted 12px "Staples:" + neutral-tag buttons `+ Milk`, `+ Eggs`, `+ Bread`, `+ Butter`, `+ Bananas`, `+ Chicken` (12px, padding 5px 12px; hover neutral-300). Clicking one fills the input with the staple's lowercase name.
- Parser rules: see [`reference-logic.md`](reference-logic.md). Enter submits. On add: clear input, toast "«Name» added to your «location»" (e.g. "Milk added to your fridge").

**Location filter + count row:** segmented control (All / Fridge / Freezer / Pantry — the `.seg` pattern) + right-aligned muted 13px "8 of 8 items".

**Item list** (replaces `src/components/inventory/InventoryList.tsx` rows):
- Vertical stack, gap 8px. Each row: `background: #ebddc5` (expired: `#fff2eb`), radius 28px, padding 12px 16px, flex gap 14px.
- Left: 10px status dot — expired `accent-600`, expiring ≤2 days `accent-400`, fresh sage `accent2-500`.
- Middle: name (15px, 600) + muted 12px "Category · location"; below, 12.5px 600 expiry line ("expires tomorrow" accent-600 / "expired 2 days ago" accent-700 / "fresh for weeks" or "no expiry" sage accent2-700).
- Right: quantity stepper — cream pill (`background: #f5ead8`, padding 3px) with round − / + buttons (30px, hover neutral-200) around e.g. "2 L" (13px, 600). Steps: ±50 for g/ml, ±0.5 for kg/L, ±1 otherwise; hitting 0 removes the item.
- Far right: round icon-button with `trash-2` (15px) — secondary style, pill radius.
- Sort by soonest expiry first (no-expiry last). **Edit-in-place is dropped** — stepper + delete cover the flows.

### 3.2 Recommendations panel — `src/components/recommendations/RecommendationsPanel.tsx` + `MealCard.tsx`

- Panel: surface card, radius 28px, shadow-sm. Kicker (h6-style uppercase 13px, accent-700) "From your fridge", h3 "What can I cook?", muted 13px "Ideas that use up your ‹two most urgent items› first."
- Meal card: nested on `background: #f5ead8`, radius 28px, padding 16px. Header row: name (Caprasimo 17px) + muted 12px "Cuisine · Type · 35 min"; right: small solid terracotta "Plan it" pill (12px, padding 7px 14px). Description: 13px at 75% opacity.
- Ingredient tags: expiring → accent-200 bg / accent-800 text, 600, suffix "— use soon"; on-hand → sage tag; missing → outline tag at 70% opacity, prefix "need ".
- **"Plan it"** starts placement mode → navigate to `/calendar` carrying the chosen meal (shared context or query param).

### 3.3 Meal plan — `src/views/CalendarPage.tsx` + `src/components/calendar/*`

- Header row: h2 "This week", muted 14px date range, right-aligned round secondary icon-buttons ← →.
- **Placement banner** (when a meal is being placed): sage pill row — `background: #e1eecc`, radius 9999px, padding 10px 20px — `check` icon + 14px "Placing **Meal Name** — tap any open slot" (accent2-900) + right ghost "Cancel".
- Week grid: 7 equal columns, gap 10px. Day column: `background: #ebddc5`, radius 28px, padding 10px; today's column gets `outline: 2px solid #c67139; outline-offset: -2px`. Day header centred: uppercase 12px 600 day-of-week at 60% opacity, date in Caprasimo 19px.
- Slots (breakfast/lunch/dinner/snack), stacked gap 6px, min-height 56px:
  - **Filled:** `background: #e1eecc` (accent2-200), radius 16px, padding 9px 10px. Uppercase 10px 600 slot label (accent2-700), meal name 12.5px 600 (accent2-900), "35 min" 11px (accent2-700). Small round × clear button top-right (20px, hover accent2-300).
  - **Empty:** dashed border 1.5px (divider), radius 16px, centred uppercase 10px label at 50% opacity + a `+` glyph at 25% opacity. **In placement mode:** dashed border turns terracotta, `background: #fff2eb`, hover `#ffe1d0`, `+` becomes bold terracotta; clicking places the meal, clears placement, toast "«Meal» planned for Wed dinner".
- **Suggestions rail** below the grid: surface card, h4 "Suggestions" + muted 12px `tap "Place", then tap a slot above`; 3-column grid of mini meal cards (cream bg, radius 28px, padding 14px 16px): Caprasimo 15px name, muted 12px "Cuisine · 35 min", expiring-ingredient accent tags, small secondary "Place on calendar" button.
- Tap-to-place **replaces drag-and-drop** (`DraggableMealCard.tsx`) as the primary interaction; DnD may stay as an optional enhancement, but tap-to-place must work (it's the touch-friendly path).

### 3.4 Groceries (Grocery List) — `src/views/GroceryListPage.tsx` + `src/components/grocery/*`

- Centred column, max-width 720px, gap 18px.
- Header: h2 "Grocery list" + muted 13px "Week of 6–12 July · built from your meal plan"; right: secondary pill "Regenerate" with `refresh-cw` (14px).
- **Progress row:** 10px-tall pill track (neutral-200) with sage (accent2-500) fill, `transition: width 0.3s`; right label 13px 600 "1/5 in the trolley".
- Category groups: h6 (uppercase 13px, accent-700) category name; below, one surface card (radius 28px, padding 6px 10px) of item rows separated by 1px dividers (none after the last):
  - Row: padding 11px 6px, gap 12px. **Round check** 26px: unchecked = 2px neutral-400 ring; checked = filled terracotta with cream check (stroke 3.5). Name 14.5px 600 (checked: line-through, 45% opacity) + muted 11.5px "for Thai Green Curry" beneath when sourced from a meal. Right: neutral qty tag + small round × remove (hover neutral-200).
- Quick add: pill input (min-height 46px, placeholder "Add something… e.g. 2 lemons, olive oil") + secondary "Add" (reuse the NL parser for qty/category).
- **Checkout** (replaces `CheckoutConfirmModal`): when ≥1 item checked, full-width solid terracotta button, min-height 48px, 15px: "Done shopping — move 2 items into my kitchen". On click: remove checked items, add them to inventory, toast "2 items moved into your kitchen".

### 3.5 Feedback — `src/views/FeedbackPage.tsx` + `src/components/feedback/*`

- Centred column, max-width 640px. h2 "Feedback" + muted 14px "Spotted a bug, or wishing for something? Tell us — the assistant asks a couple of questions and files a tidy report."
- Chat card: surface, radius 28px, min-height 280px, max-height 420px, scroll. Empty state: centred muted 14px "Describe a bug or an idea. A short back-and-forth, then it's saved for review."
- Messages: tiny muted 11px "You"/"Assistant" label above each bubble. Bubbles radius 20px, padding 9px 16px, 14px text, max-width 85%. User: right-aligned, terracotta bg, cream text. Assistant: left-aligned, cream bg (`#f5ead8`), dark text. Pending: assistant-side "…" bubble.
- Input row: pill input (min-height 46px) + solid terracotta "Send". Enter sends.

### 3.6 Toast (global)

Fixed, bottom 84px (above the nav), centred: `background: #3d472b` (accent2-800), text `#f0fae1`, radius 9999px, padding 11px 24px, 14px, shadow-lg, z-index 50. Auto-dismiss ~2.6s. One at a time (a new toast replaces the current).

---

## 4. State management mapping

Existing contexts map cleanly (no new persisted state):

- `InventoryContext` — add quick-add parse-and-commit; quantity stepping (with the step-size rule) and zero-removal.
- `RecommendationsContext` / `MealPlanContext` — add a `placing: { mealName, time } | null` shared state (or query param) for tap-to-place.
- `GroceryListContext` — a `completeShopping()` that moves purchased items into inventory (see reference logic).
- New lightweight **toast** state (context or a small hook) used by inventory add/remove, placement, and checkout.

---

## 5. Suggested implementation order

1. Tokens + fonts (tailwind.config.ts, global stylesheet, layout).
2. Shell: cream ground + new header + bottom tab bar (nav).
3. Kitchen screen (quick-add, list, use-soon strip).
4. Recommendations panel + placement flow + calendar.
5. Grocery list + checkout.
6. Feedback chat + toast.

Update the corresponding tests as labels and interactions change (nav, inventory, grocery, calendar).
