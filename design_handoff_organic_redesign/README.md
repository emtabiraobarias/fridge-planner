# Handoff: Fridge Planner — Organic Redesign

## Overview
A full visual + UX redesign of the Fridge Planner web app (Next.js App Router + Tailwind client at `packages/client`). It restyles all four screens — Inventory ("Kitchen"), Meal Plan, Grocery List, Feedback — onto the **Organic** design system (warm cream ground, terracotta + sage accents, Caprasimo/Figtree type, heavily rounded shapes), and introduces two UX changes the user has confirmed as defaults:

1. **Bottom tab bar** — a floating dark pill nav fixed at the bottom-center, replacing the header links.
2. **Smart quick-add** — a single natural-language input ("2L milk expires friday") with live parse preview and staple chips, replacing the multi-field inventory form.

## About the Design Files
`design/Fridge Planner Redesign.dc.html` is a **design reference created in HTML** — an interactive prototype showing intended look and behavior, not production code. Open it directly in a browser (keep the folder structure; it loads `support.js` and `_ds/…`). Your task is to **recreate this design in the existing Next.js + Tailwind codebase** using its established patterns (App Router pages, context providers, existing component files) — do not ship the HTML.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii and copy are final. Recreate pixel-perfectly using Tailwind. All values below are exact.

## Design Tokens
Add these to `packages/client/tailwind.config.ts` (`theme.extend`) and load the fonts in `app/layout.tsx` via `next/font/google` (Caprasimo weight 400; Figtree weights 400/600/700).

Colors:
- `bg` #f5ead8 (page ground) · `surface` #ebddc5 (cards/rows) · `text` #201e1d
- `accent` (terracotta) #c67139; ramp 100–900: #fff2eb, #ffe1d0, #ffc6a5, #f6a06b, #d67f48, #b2622d, #8c491a, #643312, #402310
- `accent2` (sage) #7a8a5e; ramp 100–900: #f0fae1, #e1eecc, #ccdbb2, #aebf92, #8fa073, #728157, #56633f, #3d472b, #272e1b
- `neutral` ramp 100–900: #f9f4ed, #eee7db, #dcd3c4, #c0b6a5, #a19786, #82796a, #645c50, #474238, #2e2b25
- Divider: `color-mix(in srgb, #201e1d 16%, transparent)` (≈ rgba(32,30,29,0.16))
- Muted text: 55% opacity of `text`

Typography:
- Headings: Caprasimo 400, line-height 1.12, letter-spacing −0.015em. Scale: h1 42 / h2 32 / h3 25 / h4 20 / h5 16 / h6 13 (h6 uppercase, letter-spacing 0.08em)
- Body: Figtree, 15px base, line-height 1.55

Radii: sm 8px · md 16px · lg 28px · pills/buttons/inputs `9999px`
Shadows: sm `0 1px 2px rgba(46,43,37,0.14)` · md `0 3px 10px rgba(46,43,37,0.16)` · lg `0 12px 32px rgba(46,43,37,0.22)`
Icons: Lucide (`lucide-react` is the natural fit), **stroke-width 2.75** everywhere.
States: hover = one ramp step past base (e.g. accent-600 on light ground); focus = `outline: 2px solid #c67139; outline-offset: 2px` via `:focus-visible` (never the default blue ring); selection = 30% accent tint; disabled = 45% opacity.

Also set global `a { color: accent }` / `a:hover { color: accent-600 }` in `src/index.css`.

## Global Shell — `app/layout.tsx` + `app/nav.tsx`
Current: white header with indigo nav links on gray-50.
New:
- Page: `min-height 100vh; background #f5ead8; padding-bottom 96px` (clearance for the bottom nav). Content container: `max-width 1160px`, horizontal padding 28px.
- Header (top of page, no border, transparent on the cream ground): brand mark — 40px circle, `background #c67139`, containing a white fridge icon (Lucide `refrigerator`, 21px, stroke 2.75) — next to "Fridge Planner" in Caprasimo 22px.
- **Navigation = bottom tab bar** (rewrite `app/nav.tsx`): `position: fixed; bottom: 18px; left: 50%; translateX(-50%)`, `background #2e2b25` (neutral-900), `border-radius: 9999px; padding: 7px`, shadow-lg, `z-index 40`, `display: flex; gap: 4px`.
  - Tabs (icon 16px + label, Lucide stroke 2.75): Kitchen `refrigerator` (route `/`), Meal plan `calendar` (`/calendar`), Groceries `shopping-cart` (`/grocery`), Feedback `message-circle` (`/feedback`). **Note the label renames**: Inventory→Kitchen, Meal Plan→Meal plan, Grocery List→Groceries.
  - Tab style: pill button, `padding 10px 18px`, 13px Figtree 600. Active: `background #c67139; color #f5ead8`. Inactive: transparent, `color #dcd3c4` (neutral-300); hover: 12% white tint background, white text.
  - Keep the existing active-route logic and `aria-current`; update `tests/app/nav.test.tsx`.

## Screens / Views

### 1. Inventory / "Kitchen" — `src/views/InventoryPage.tsx`
Layout: two-column grid `1fr 400px`, gap 28px (single column below ~900px). Left column stacks (gap 20px): use-soon strip → smart quick-add card → location filter row → item list. Right column: recommendations panel.

**Use-soon strip** (shows when any item expires within 2 days; replaces the current summary chips):
- Row, `background #fff2eb` (accent-100), radius 28px, padding 12px 18px. Clock icon (accent-700, 18px), bold 13px "Use soon:" in accent-800, then one cream pill per urgent item (`background #f5ead8`, text accent-800): "Baby Spinach · tomorrow". Right-aligned ghost button "Cook these →" scrolls to the recommendations panel.

**Smart quick-add** (replaces `src/components/inventory/InventoryForm.tsx`):
- Card: `background #ebddc5`, radius 28px, padding ~24px, shadow-sm. Heading h4 "Add to your kitchen" + muted 12px "type it like you'd say it".
- Input row: pill input (radius 9999px, min-height 46px, 15px text, `background #f9f4ed`) with a terracotta Lucide `sparkles` icon inside on the left (padding-left 40px); placeholder `2L milk expires friday · 500g mince · 6 eggs…`. Solid terracotta "Add" pill button beside it (min-height 46px).
- **Live parse preview** below while typing: muted 12px "I'll add:" followed by tags — name (accent tag, 600 weight), quantity (neutral tag), "Category · location" (sage tag), and if an expiry was parsed, an accent-200/accent-800 tag "expires Fri 17 Jul".
- **Staple chips**: muted 12px "Staples:" + neutral-tag buttons `+ Milk`, `+ Eggs`, `+ Bread`, `+ Butter`, `+ Bananas`, `+ Chicken` (12px, padding 5px 12px; hover neutral-300). Clicking one fills the input.
- Parser rules (implement client-side; see `parseQuick()` in the prototype source for a working reference): leading `qty + unit` (`2L`, `500 g`, `6`); `expires <token>` where token is a weekday name ("friday" → next Friday), relative (`3d`, `2w`), or `dd/mm`; category+location guessed from name keywords (dairy/meat/seafood/produce/grains/frozen/condiments → fridge/freezer/pantry). Title-case the name. Enter submits. On add: clear input, show toast "«Name» added to your fridge".

**Location filter + count row**: segmented control (All / Fridge / Freezer / Pantry — the design-system `.seg` pattern: a pill container with radio-style options, selected option gets a filled pill) + right-aligned muted 13px "8 of 8 items".

**Item list** (replaces `src/components/inventory/InventoryList.tsx` rows):
- Vertical stack, gap 8px. Each row: `background #ebddc5` (expired: #fff2eb), radius 28px, padding 12px 16px, flex gap 14px.
- Left: 10px status dot — expired accent-600, expiring ≤2 days accent-400, fresh sage (accent2-500).
- Middle: name (15px, 600) + muted 12px "Category · location" on one line; below, 12.5px 600 expiry line ("expires tomorrow" accent-600 / "expired 2 days ago" accent-700 / "fresh for weeks" or "no expiry" sage accent2-700).
- Right: quantity stepper — cream pill (`background #f5ead8`, padding 3px) with round − / + buttons (30px, hover neutral-200) around "2 L" (13px, 600). Steps: ±50 for g/ml, ±0.5 for kg/L, ±1 otherwise; hitting 0 removes the item.
- Far right: round icon-button with Lucide `trash-2` (15px) — secondary style, radius 9999px.
- Sort by soonest expiry first (no-expiry items last). Edit-in-place from the old UI is dropped in this design — stepper + delete cover the flows.

### 2. Recommendations panel — `src/components/recommendations/RecommendationsPanel.tsx` + `MealCard.tsx`
- Panel: surface card, radius 28px, shadow-sm. Kicker (h6-style uppercase 13px, accent-700) "From your fridge", h3 "What can I cook?", muted 13px "Ideas that use up your ‹two most urgent items› first."
- Each meal card: nested on `background #f5ead8`, radius 28px, padding 16px. Header row: name (Caprasimo 17px) + muted 12px "Cuisine · Type · 35 min"; right: small solid terracotta "Plan it" pill (12px, padding 7px 14px).
- Description: 13px at 75% opacity.
- Ingredient tags: expiring → accent-200 bg / accent-800 text, 600 weight, suffix "— use soon"; on-hand → sage tag; missing → outline tag at 70% opacity, prefix "need ".
- **"Plan it" starts placement mode**: navigate to `/calendar` carrying the chosen meal (context or query param), see below.

### 3. Meal Plan — `src/views/CalendarPage.tsx` + `src/components/calendar/*`
- Header row: h2 "This week", muted 14px date range, right-aligned round secondary icon-buttons ← →.
- **Placement banner** (when a meal is being placed): sage pill row — `background #e1eecc`, radius 9999px, padding 10px 20px — check icon + 14px "Placing **Meal Name** — tap any open slot" (accent2-900) + right ghost "Cancel".
- Week grid: 7 equal columns, gap 10px. Day column: `background #ebddc5`, radius 28px, padding 10px; today's column gets `outline: 2px solid #c67139; outline-offset: -2px`. Day header centered: uppercase 12px 600 day-of-week at 60% opacity, date in Caprasimo 19px.
- Slots (breakfast/lunch/dinner/snack), stacked gap 6px, min-height 56px:
  - **Filled**: `background #e1eecc` (accent2-200), radius 16px, padding 9px 10px. Uppercase 10px 600 slot label (accent2-700), meal name 12.5px 600 (accent2-900), "35 min" 11px (accent2-700). Small round × clear button top-right (20px, hover accent2-300).
  - **Empty**: dashed border 1.5px (divider color), radius 16px, centered uppercase 10px label at 50% opacity + a + glyph at 25% opacity. **In placement mode**: dashed border turns terracotta, `background #fff2eb`, hover #ffe1d0, + becomes bold terracotta; clicking places the meal, clears placement, shows toast "«Meal» planned for Wed dinner".
- **Suggestions rail** below the grid: surface card, h4 "Suggestions" + muted 12px `tap "Place", then tap a slot above`; 3-column grid of mini meal cards (cream bg, radius 28px, padding 14px 16px): Caprasimo 15px name, muted 12px "Cuisine · 35 min", expiring-ingredient accent tags, small secondary "Place on calendar" button.
- This tap-to-place flow **replaces drag-and-drop** (`DraggableMealCard.tsx`) as the primary interaction; keep DnD as an enhancement if desired, but tap-to-place must work (it's also the touch-friendly path).

### 4. Grocery List — `src/views/GroceryListPage.tsx` + `src/components/grocery/*`
- Centered column, max-width 720px, gap 18px.
- Header: h2 "Grocery list" + muted 13px "Week of 6–12 July · built from your meal plan"; right: secondary pill "Regenerate" with Lucide `refresh-cw` (14px).
- **Progress row**: 10px-tall pill track (neutral-200) with sage (accent2-500) fill, `transition width 0.3s`; right label 13px 600 "1/5 in the trolley".
- Category groups: h6 (uppercase 13px, accent-700) category name; below, one surface card (radius 28px, padding 6px 10px) containing item rows separated by 1px divider (none after last):
  - Row: padding 11px 6px, gap 12px. **Round check** 26px: unchecked = 2px neutral-400 ring; checked = filled terracotta with cream check (stroke 3.5). Name 14.5px 600 (checked: line-through, 45% opacity) + muted 11.5px "for Thai Green Curry" beneath when sourced from a meal. Right: neutral qty tag + small round × remove (hover neutral-200).
- Quick add: pill input (min-height 46px, placeholder "Add something… e.g. 2 lemons, olive oil") + secondary "Add" (reuse the same NL parser for qty/category).
- **Checkout** (replaces `CheckoutConfirmModal` flow): when ≥1 item checked, full-width solid terracotta button, min-height 48px, 15px: "Done shopping — move 2 items into my kitchen". On click: remove checked items from the list, add them to inventory, toast "2 items moved into your kitchen".

### 5. Feedback — `src/views/FeedbackPage.tsx` + `src/components/feedback/*`
- Centered column, max-width 640px. h2 "Feedback" + muted 14px "Spotted a bug, or wishing for something? Tell us — the assistant asks a couple of questions and files a tidy report."
- Chat card: surface, radius 28px, min-height 280px, max-height 420px, scroll. Empty state: centered muted 14px "Describe a bug or an idea. A short back-and-forth, then it's saved for review."
- Messages: tiny muted 11px "You"/"Assistant" label above each bubble. Bubbles radius 20px, padding 9px 16px, 14px text, max-width 85%. User: right-aligned, terracotta bg, cream text. Assistant: left-aligned, cream bg (#f5ead8), dark text. Pending: assistant-side "…" bubble.
- Input row: pill input (min-height 46px) + solid terracotta "Send". Enter sends.

### Toast (global)
Fixed, bottom 84px (above the nav), centered: `background #3d472b` (accent2-800), text #f0fae1, radius 9999px, padding 11px 24px, 14px, shadow-lg, z-index 50. Auto-dismiss ~2.6s.

## Interactions & Behavior
- Nav: active tab = terracotta fill; hover on inactive = white 12% tint. All transitions ~150ms ease on background.
- Quick-add: parse on every keystroke (preview), Enter or Add commits; staple chip fills input.
- Placement mode: entered from "Plan it"/"Place on calendar"; exited by placing, or Cancel. Empty slots become the only click targets.
- Grocery check toggles purchase state instantly (optimistic), progress bar animates.
- Hover states throughout come from the ramp (one step darker); `:focus-visible` = 2px terracotta outline.
- No entrance animations; keep motion to background/width transitions listed above.

## State Management
Existing contexts map cleanly:
- `InventoryContext` — add quick-add parse-and-commit; quantity stepping (with step-size rule) and zero-removal.
- `RecommendationsContext` / `MealPlanContext` — add a `placing: {mealName, time} | null` shared state (or query param) for the tap-to-place flow.
- `GroceryListContext` — `completeShopping()` that moves purchased items into inventory (see prototype for reference logic).
- New lightweight toast state (context or a small hook), used by inventory add/remove, placement, and checkout.

## Assets
- Fonts: Caprasimo (400), Figtree (400/600/700) — Google Fonts via `next/font/google`.
- Icons: Lucide (`lucide-react`), stroke-width 2.75: `refrigerator`, `calendar`, `shopping-cart`, `message-circle`, `clock`, `sparkles`, `trash-2`, `refresh-cw`, `check`, plus glyph +/−/×.
- No raster images.

## Files
- `design/Fridge Planner Redesign.dc.html` — the interactive prototype (all four screens; the tab bar switches screens). The `<script data-dc-script>` block at the bottom contains reference logic: the NL parser (`parseQuick`), expiry labeling (`expiryText`), stepper sizing (`stepFor`), placement flow, and checkout.
- `design/_ds/organic-…/styles.css` — the design-system token sheet and component classes (buttons, tags, cards, seg control, inputs); the canonical source for every value above.
- `design/support.js`, `design/_ds/organic-…/_ds_bundle.js` — runtime for opening the prototype in a browser; not relevant to implementation.

## Suggested implementation order
1. Tokens + fonts (tailwind.config.ts, index.css, layout.tsx)
2. Shell: cream ground + new header + bottom tab bar (nav.tsx)
3. Inventory screen (quick-add, list, use-soon strip)
4. Recommendations panel + placement flow + calendar
5. Grocery list + checkout
6. Feedback chat + toast
Update the corresponding tests (`tests/app/nav.test.tsx`, inventory/grocery/calendar component tests) as labels and interactions change.
