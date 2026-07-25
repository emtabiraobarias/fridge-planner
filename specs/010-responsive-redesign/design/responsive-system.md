# Responsive System — canonical design reference (spec 010)

> This file is the **canonical, self-contained** visual specification for "The Fridge" responsive
> redesign (spec `010`). It carries every breakpoint, padding value, colour, type step, radius,
> shadow, copy string, and per-screen visual spec needed to build the redesign without the
> external handoff folder (`design_handoff_fridge_planner_responsive/`, never committed — safe to
> delete once this file exists). Fidelity is **high**: colours, type, spacing, radii and copy are
> final and should be matched closely, exactly as the handoff intended.
>
> **Colour and type tokens originate in spec `004`'s design system**
> (`specs/004-organic-redesign/design/organic-design-system.md`) and are **verified byte-identical**
> between the handoff's stylesheet and the app's shipped Organic tokens (spec `010` reconciliation
> item 1) — this file restates them here for completeness so nothing requires cross-referencing,
> but `004` remains the token source of truth if the two ever drift.
>
> **This is a visual/layout reference, not a behavioural override.** Wherever a design element was
> **ADAPT**ed or **REJECT**ed in `specs/010-responsive-redesign/spec.md`'s *Alignment reconciliation*
> table, this file transcribes the handoff's visual treatment (geometry, colour, copy) but flags the
> governing behaviour with a `> Reconciled:` note pointing at the binding `FR-RS-xxx`. Never build the
> rejected/adapted *behaviour* from a `> Reconciled:` section — only its surrounding visual shell.

---

## 1. Responsive system

One component tree; layout adapts by CSS condition — **never** by device sniffing or a user-set
device mode (FR-RS-001).

### 1.1 Viewport classes

| Viewport class | CSS condition |
| --- | --- |
| Phone portrait | `< 640px` |
| Phone landscape | `< 900px` **and** `orientation: landscape` **and** short height (`max-height: 500px`) |
| iPad portrait | `640px – 1023px` |
| iPad landscape | `1024px – 1279px` |
| Desktop | `≥ 1280px` |

### 1.2 Column counts by region

| Region | Phone portrait | Phone landscape / iPad portrait | iPad landscape / desktop |
| --- | --- | --- | --- |
| Home stat cards | 2 columns | 4 columns | 4 columns |
| Home main cards | 1 column | 2 columns | 3 columns |
| Fridge shelves | 1 column | 2 columns | 3 columns |
| Grocery categories | 1 column | 2 columns | 3 columns |
| Day strip (Plan, phone only) | 7 columns always | 7 columns | — (grid retained; see §4.3) |

### 1.3 Content padding

| Viewport | Top | Sides | Bottom |
| --- | --- | --- | --- |
| Phone portrait | 54px | 16px | 116px (clears the bottom nav) |
| Phone landscape | 30px | right 16px / **left 96px** (clears the left nav rail) | 44px |
| iPad portrait | 40px | 34px | 116px |
| iPad landscape | 40px | right 34px / **left 120px** (clears the left nav rail) | 44px |
| Desktop | 32px | 40px | 48px |

**Desktop content max-width: 1120px, centred.** Other viewports: 100% width.

### 1.4 Implementation notes (hard-won — both are requirements, not suggestions)

1. **Viewport-filling root with the content region as the ONLY scroll container.** The app root
   must fill the viewport (`height: 100%` / `100dvh`), and the content region must be the sole
   scrolling element (`flex: 1; min-height: 0; overflow: auto`), with the nav positioned against
   the root, outside that scroll container. *Rationale:* if the root is allowed to grow to content
   height instead, the nav scrolls off screen with the page — this was a real bug during design,
   and it directly contradicts FR-RS-004 ("navigation and the feedback affordance never scroll out
   of view").
2. **`box-sizing: border-box` on the padded content wrapper.** *Rationale:* without it, the padding
   in §1.3 adds to a `width: 100%` box and causes horizontal overflow — another real bug found in
   review, and the thing SC-RS-001 ("no horizontal page scrolling... 100% of screen × viewport
   combinations") directly measures.

Wide content (tables, grids, code) must scroll within its own container rather than the page body
(FR-RS-007).

---

## 2. Navigation

> Reconciled: item 4 in the spec's reconciliation table — the portrait pill **already exists**
> (`004` FR-UI-007) and is kept; only the landscape rail and desktop sidebar are net-new (FR-RS-002).
> Item labels below are the redesign's target labels (spec `010` supersedes `004`'s FR-UI-009 tab
> labels) — but per FR-RS-026 **no route is renamed**; `Home` is a net-new route, the other three
> keep their existing paths (`/`, `/calendar`, `/grocery`) under new labels.

### 2.1 Floating pill nav (touch — portrait and landscape)

- Container: `background: --color-neutral-900`, radius `999px`, `--shadow-lg`.
- **Portrait:** horizontal, `bottom: 26px`, centred (`left: 50%; transform: translateX(-50%)`),
  padding `6px`, gap `3px`.
- **Landscape:** vertical (`flex-direction: column`), `left: 22px`, vertically centred
  (`top: 50%; transform: translateY(-50%)`), padding `8px`, gap `4px`.
- **Items:** flex column (icon over label), gap `2px`, padding `8px 15px`, radius `999px`.
  Label `10px` weight 700; icon `19–20px`.
  - **Active:** bg `--color-accent`, text `--color-bg`.
  - **Inactive:** transparent, text `--color-neutral-300`.
- Labels, in order: **Home**, **Fridge**, **Plan**, **List**.

### 2.2 Desktop collapsible sidebar

- **Expanded width: 250px. Collapsed width: 76px.** Transition `width .2s ease`.
- Background `--color-surface`, padding `26px 16px`, `border-right: 1px solid --color-divider`,
  items gap `6px`.
- **Brand row:** 38px `--color-accent` circle containing a fridge glyph in `--color-bg`; wordmark
  "Fridge Planner" heading font `19px` (**hidden when collapsed**); then a ghost icon button
  (`aria-label="Toggle navigation"`) pushed to the right — chevron-**left** when expanded
  (collapses), chevron-**right** when collapsed (expands).
- **Nav items:** flex row, gap `11px`, padding `12px 15px`, radius `999px`, `14px` weight 700 label,
  `20px` icon.
  - **Active:** bg `--color-accent`, text `--color-bg`.
  - **Inactive:** transparent, text `--color-text`.
- **Collapsed state:** labels hidden, items become `justify-content: center; padding-inline: 0`,
  each item carries a `title` attribute for a native tooltip (a proper tooltip component is
  preferable in production).
- Order: **Home**, **The fridge**, **Meal plan**, **Grocery list**.
- The collapsed/expanded preference persists across sessions (FR-RS-003, SC-RS-009).

### 2.3 Feedback affordance geometry

A feedback affordance is present on every screen and viewport, positioned so it never obscures
navigation (FR-RS-006).

| Viewport | Geometry |
| --- | --- |
| Phone portrait | 56×56 circle, `right: 16px`, `bottom: 96px` |
| iPad portrait | 60×60 circle, `right: 26px`, `bottom: 100px` |
| Phone landscape | 54×54 circle, `right: 16px`, `bottom: 20px` |
| iPad landscape | 60×60 circle, `right: 24px`, `bottom: 24px` |
| Desktop | Pill, height `54px`, padding-inline `22px`, `right: 32px`, `bottom: 32px`, label `Tell us` (`14px` weight 700) |

Background `--color-accent`, `--shadow-lg`, 24px speech-bubble icon (`message-circle`) in
`--color-bg`.

> Reconciled: this is a **quick-capture** entry point only (FR-RS-006). The full `/feedback` route
> — chat, record history, Promote to development, pipeline status — is untouched and remains
> reachable; see §5.3.

---

## 3. Interaction & animation baseline

Applies across all screens and overlays; restated here because it governs every section below.

- **Instant-feedback interactions** (optimistic, no confirmation step): inventory steppers, grocery
  row toggles, day selection, week navigation, sidebar collapse.
- **Confirmed interactions:** *Mark cooked* (consumption modal), *Send feedback*.
- **Animations:** sheet slide-up `260ms cubic-bezier(.22,.61,.36,1)`; scrim/dialog fade
  `180–200ms`; sidebar width `200ms ease`. **All suppressed under `prefers-reduced-motion`**
  (FR-RS-025).
- **Hover / focus / active:** inherits the Organic system — every interactive element gets an
  accent-ramp hover tint and a pressed state; focus is
  `outline: 2px solid var(--color-accent); outline-offset: 2px` via `:focus-visible`. **Never** the
  default browser focus ring.
- **Minimum touch target: 44px** in each dimension for every interactive control (FR-RS-025,
  SC-RS-003) — the stepper `−`/`+` hit areas in particular are smaller than this in the source
  handoff and must be enlarged.

---

## 4. Per-screen visual specs

### 4.1 Home *(net-new route, US5)*

**Purpose:** answer "what do I have, what should I cook, what do I need to buy" in one scroll, and
route to the single most valuable action.

**Layout:** vertical stack, gap `16px` (phone) / `20px` (larger).

**Components, in order:**

1. **Header** — meta line, e.g. `Sunday, 20 Jul` (`13px`, muted). Title `Your kitchen at a glance`,
   heading font, `30px` phone / `38px` iPad / `40px` desktop, line-height `1.06`.
2. **Stat cards** — grid (column counts: §1.2), gap `14px`, radius `22px`, padding `17px`. Big
   number in heading font `36px`/line-height `1`, label `12px` weight 600 below (`margin-top: 5px`):
   - **expiring soon** — bg `--color-accent` (`#c67139`), text `--color-bg`
   - **meals planned** — bg `--color-accent-2-500`, text `--color-bg`
   - **groceries in** — bg `--color-neutral-900` (`#2e2b25`), text `--color-bg`, label opacity `.85`
   - **items tracked** — surface card (`--color-surface`), label muted
   - > Reconciled: FR-RS-020 — all four figures are **derived from existing endpoint data** (no new
     endpoint/model): expiring-soon count, meals planned this week, grocery checked/total, total
     inventory items. The handoff's illustrative values (`1`, `3`, `3/6`, `7`) are seed data only.
3. **"Use it up first" banner** — bg `--color-accent-100` (`#fff2eb`), radius `24px`, padding `20px`,
   flex row wrap, gap `16px`.
   - Left column (`min-width: 220px`): kicker `Use it up first` (`11px`, weight 700,
     letter-spacing `.09em`, uppercase, `--color-accent-700`); headline e.g.
     `Spinach expires tomorrow` (heading font `24px`); body e.g.
     `Try Vegetable Fried Rice — 20 min, and it uses the whole bunch.` (`14px`, `--color-accent-800`).
   - Right: primary button `Cook this →` (`14px`, padding `12px 20px`).
   - > Reconciled: FR-RS-021 — the banner names the soonest-expiring item from **already-fetched**
     inventory data on load; it must **not** issue a recommendation/AI request on load (`009`
     FR-IR-001). The `Cook this →` action opens *scoped* recommendations only on tap — the "and it
     uses the whole bunch" recipe pairing shown in the handoff is illustrative and must come from
     that on-tap call, not a preloaded suggestion.
   - Edge case: with no expiring item, the banner is replaced by a calm alternative rather than an
     empty highlight.
4. **Three cards** (grid per §1.2), each surface, radius `22px`, padding `16/17px`:
   - **Tonight** — title `19px` + `Week →` link (`13px`, weight 700) navigating to the meal plan.
     Inside: bg `--color-accent-2-100` pill-card, radius `16px`, padding `13/15px`; slot label
     `DINNER` (`10px`, weight 700, letter-spacing `.08em`, uppercase, `--color-accent-2-700`), then
     e.g. `Chicken Adobo · 45 min` (`15px`, weight 700).
   - **Grocery run** — clickable, navigates to the grocery list. Title `19px` + progress label e.g.
     `3/6 in` (`13px`, weight 700, `--color-accent-2-700`). Progress bar: height `10px`, radius
     `999px`, track `--color-neutral-200`, fill `--color-accent-2-500`, width = checked/total %.
     Caption `Built from this week's meals` (`13px`, muted).
   - **Fresh picks** — title `19px`, then 3 rows (gap `8px`): status dot `8px` circle, item name
     (`14px` weight 600), quantity right-aligned (`12px`, muted). Shows the first 3 inventory items.
   - Each card links into the meal plan or grocery list per FR-RS-022; when the underlying data is
     empty, each card shows a sensible empty state rather than a zero-filled or broken card.

### 4.2 The Fridge — spatial inventory

**Purpose:** see everything owned, grouped by physical location, correct quantities in one tap.

**Layout:** header → add input → shelf grid.

1. **Header** — kicker `Inventory`, title `The fridge` (same title scale as Home).
2. **Add input** — pill: min-height `50px`, bg `--color-neutral-100`, border `1.5px`
   `--color-divider`, radius `999px`, padding-inline `16px`, `14px` text `--color-neutral-600`.
   Leading sparkle icon `16px` in `--color-accent`. Placeholder copy:
   `Add — 2L milk expires friday…`. Width `100%`, `max-width: 520px`, horizontally centred.
   - > Reconciled: FR-RS-011 — adopt only this **visual treatment**. The field must retain the
     entire shipped spec `005` parse-preview UX beneath it (correctable provenance chips, alias
     memory, AI-assist fallback) — the handoff's "decorative pill" framing is not the target;
     spec `005` already shipped a working parser.
3. **Shelf cards** — one per storage location, grid per §1.2, gap `14px`, radius `22px`, padding
   `16/17px`, `--shadow-sm`. Tinted background per shelf:
   - **Fridge** → `--color-accent-2-100`
   - **Freezer** → `--color-accent-100`
   - **Pantry** → `--color-neutral-100`
   - A location value outside this known set still renders, grouped under a fallback shelf, never
     dropped.
   - A shelf with zero items shows a zero count and an empty hint rather than disappearing.

   *Shelf header:* fridge icon `17px`, location name (heading font `18px`), right-aligned count
   `N items` (`12px`, muted). Divider below: padding-bottom `11px`, border-bottom `1.5px`
   `--color-divider`, margin-bottom `12px`.

   *Items:* flex wrap, gap `8px`. **Each item is an editable chip** — bg `--color-bg`, radius
   `14px`, padding `8px 10px 8px 14px`, `--shadow-sm`, containing:
   - status dot, `8px` circle: `--color-accent` if expiring soon, `--color-accent-2-500` normally,
     `--color-neutral-400` when quantity is 0 — status must be distinguishable by more than colour
     alone (FR-RS-009).
   - item name, `14px` weight 700.
   - **quantity stepper** — bg `--color-neutral-100`, radius `999px`, padding `4px 10px`, gap
     `10px`: `−` and `+` (`16px` weight 700, `--color-accent-700`, `user-select: none`) flanking the
     value (`12px` weight 600, `min-width: 48px`, centred, muted), e.g. `1 count`.

   **Stepper behaviour:** each item has its own step size and unit; the value floors at 0 and
   persists (FR-RS-009). Seed data (illustrative, not a fixture): Spinach 1 count (step 1,
   *expiring*), Chicken Thighs 1000 g (step 100), Eggs 6 count (step 1), Milk 4 L (step 1), Mince
   500 g (step 100), Salmon 600 g (step 100), Tortillas 1 count (step 1). Seed locations:
   Spinach/Chicken Thighs/Eggs/Milk = fridge; Mince/Salmon = freezer; Tortillas = pantry.

   > Reconciled: FR-RS-010 — the shelf/chip treatment above is additive. The redesigned Kitchen
   > must **retain every shipped capability** the handoff's flat-list design does not show: expiry
   > visibility, the item edit sheet (including expiry and location, `004` FR-UI-019R), delete, and
   > ingredient selection for scoped recipe search (`009` FR-IR-006 select mode). Quantity stepped
   > to zero keeps the item visible and distinguishable, per shipped behaviour — items are never
   > silently removed.

### 4.3 Meal plan — week calendar

**Purpose:** see the week, place suggested meals on specific days, record what was actually cooked.

1. **Header row** — space-between, wraps. Left: kicker `Meal plan`, title `This week`, week range
   e.g. `20 – 26 Jul` (`13px`, muted, computed from the visible week). Right: two week-navigation
   icon buttons (secondary, `34×34`, `chevron-left` / `chevron-right`, `aria-label` "Previous week"
   / "Next week") shifting the week ±7 days.

2. **Day strip (phone only)** — 7-column grid, gap `7px`. Each cell: radius `16px`, padding
   `10px 0 8px`, centred, tappable to select that day:
   - weekday abbreviation (MON…SUN), `9.5px` weight 700, letter-spacing `.05em`
   - date number, heading font `20px`
   - a `5px` "has meals" dot below (transparent when the day is empty)
   - **selected:** bg `--color-accent`, text `--color-bg`, dot `--color-bg`
   - **unselected:** bg `--color-surface`, text `--color-text`, dot `--color-accent`
   - > Reconciled: FR-RS-012/013 — this is a **phone-only** replacement. On iPad and desktop the
     shipped **7×4 slot grid is retained**, including drag-and-drop rearrangement (`001` FR-022,
     `004` FR-UI-023) and per-slot clearing — it is not replaced by the day strip on larger
     viewports. See `004`'s grid spec (§3.3 of `organic-design-system.md`) for the retained grid's
     own visual detail; this file only specifies the net-new phone day strip.

3. **Selected day heading (phone)** — e.g. `Monday 20`, heading font `22px`.

4. **Planned meals for the selected day (phone)** — stack, gap `9px`. Each card radius `18px`,
   padding `13/15px`, flex row, gap `12px`:
   - Left region tappable → opens the recipe modal (§5.2). Slot label (`10px` weight 700 uppercase,
     letter-spacing `.08em`, `--color-accent-2-700`), meal name (`15px` weight 700), then
     `45 min · View recipe` (`12px` muted, "View recipe" in weight 600 `--color-accent-700`).
   - Right: `Mark cooked` button (secondary, `12px`, padding `9px 14px`).
   - **Not cooked:** card bg `--color-surface`, button label `Mark cooked`.
   - **Cooked:** card bg `--color-accent-2-100`, meal name struck through and dimmed to `50%`,
     button label `✓ Cooked` with bg/border `--color-accent-2-600` and `--color-bg` text.
   - Tapping `✓ Cooked` on an already-cooked meal un-marks it directly — no modal (subject to the
     receipt-based un-cook reconciliation in §5.2).

5. **Empty state (phone, day with no meals)** — dashed border `1.5px` `--color-divider`, radius
   `18px`, padding `18px`, centred, `13px` weight 600 muted:
   `Nothing planned for this day yet — add one from the suggestions below.`

6. **Suggestions** — heading `Suggestions` (`22px`) and a hint line
   `Tap Place to add to <selected day>.` (`12px` muted, day name bold). Grid (columns per §1.2) of
   surface cards, radius `22px`, flex row: name (heading font `16px`), `cuisine · duration` (`12px`
   muted), primary `+ Place` button (`12px`, padding `9px 15px`).

   **Place behaviour:** appends the meal to the currently selected day, auto-assigning the first
   free slot in order **Breakfast → Lunch → Dinner → Snack** (falling back to Dinner if all taken),
   then toasts `Added <meal> to <slot>`.

   > Reconciled: FR-RS-015 — suggestions must **never load automatically** on any viewport (`009`
   > manual-only recommendations). Both the phone suggestions rail above and the retained iPad/
   > desktop grid's suggestions rail require an explicit call to action and show an empty state
   > until requested; ingredient-scoped requests (`009`'s two scoped entry points) remain available.
   > The handoff's "always-present static array" is not the target.

**Seed plan (illustrative):** Mon 20 Jul 2026 has Breakfast *Chicken Adobo* (45 min), Lunch
*Vegetable Fried Rice* (20 min), Snack *Vegetable Fried Rice* (20 min); all other days empty.

> **Date handling.** The handoff recommends building day keys from local date parts
> (`getFullYear()/getMonth()+1/getDate()`) rather than `toISOString()`/`new Date('YYYY-MM-DD')`, to
> avoid a UTC-shift off-by-one it hit during design. **This spec does not apply that advice**: the
> app is deliberately UTC-anchored (see spec `010`'s Assumptions) — mixing conventions is exactly
> what would introduce the bug the handoff is warning about. Date handling stays as shipped.

### 4.4 Grocery list

**Purpose:** shop efficiently by category and fold the result back into inventory.

1. **Header** — kicker `Shopping`, title `Grocery list`.
2. **Progress summary** — surface card, radius `22px`, padding `18px`, flex row gap `18px`,
   `max-width: 520px`, centred. Left: a `72px` **progress ring** —
   `conic-gradient(--color-accent-2-500 <pct>, --color-neutral-300 0)` with an inset `9px`
   surface-coloured disc showing e.g. `3/6` (heading font `17px`). Right: `In the trolley` (`16px`
   weight 700) + `Built from this week's meals` (`13px` muted).
3. **Category groups** — grid (columns per §1.2), gap `14px`, `align-items: start`. Each: category
   kicker, then a surface container radius `20px` padding `5px 6px` holding rows. **Each row is
   tappable to toggle:** padding `12px`, gap `13px`:
   - `26px` circular checkbox, border `2px`. **Unchecked:** transparent fill, border
     `--color-divider`. **Checked:** fill + border `--color-accent`, `--color-bg` checkmark
     (stroke-width `3.4`). (Real checkbox semantics per §6.)
   - item name `15px` weight 600; **checked → strikethrough + 42% text opacity**
   - quantity as a neutral tag on the right
4. **Primary action** — `Done shopping — move <N> into my kitchen`. Min-height `52px`, `15px`.
   Full-width on touch; auto-width with `32px` inline padding, centred on desktop.

   > Reconciled: FR-RS-017/018 — the row-toggle above must trigger the shipped **spec `007`**
   > semantics exactly and unchanged: checking a row **immediately** adds/merges it into inventory
   > with a purchase receipt; unchecking **exactly reverses** from that receipt (409 for
   > receipt-less legacy rows), including the ambiguous-quantity confirmation where it applies.
   > **`N` in the primary action is the count of rows NOT YET added to inventory** (receipt-less
   > rows) — **not** "unchecked" as the handoff's copy implies (its own open question, "unchecked or
   > checked?", is already answered by shipped code: `007` FR-GC-011). Completing the action adds
   > and marks only those receipt-less rows and **does not clear the list** — the handoff's "move N
   > into my kitchen [and clear]" model is rejected; keep its visual treatment (ring, card, button)
   > only.
   > Reconciled: FR-RS-019 — the list is **rolling and date-scoped** (`008`), so surface the week it
   > covers (e.g. in the header/progress card) so a row dropping out at a day rollover reads as
   > expected rather than as a bug. The handoff's static category list does not show this; the
   > visual grouping/row treatment is otherwise adopted as designed.

**Seed list (illustrative):** Produce — Lemons 2 kg *(checked)*, Spinach 1 bunch; Grains — Rice 1
bag *(checked)*, Tortillas 1 pack *(checked)*; Condiments — Sesame Oil 1 serving; Other — Limes 2
servings. → 3 of 6 checked.

---

## 5. Overlay pattern

All overlays share one responsive shell (FR-RS-023); three concrete overlays are specified below
it.

### 5.1 Shared sheet/dialog shell

- **Touch (phone + iPad): bottom sheet.** Container aligns to `flex-end`; panel is full-width,
  radius `30px 30px 0 0`, padding `14px 22px 40px`, with a **grab handle** (`42×5px`, radius
  `999px`, `--color-divider`, centred, `margin-bottom: 14px`). Animates in with
  `translateY(100%) → 0` over **260ms `cubic-bezier(.22,.61,.36,1)`**.
- **Desktop: centred dialog.** Panel `width: min(460px, 90%)`, radius `28px`, padding `26px`, fades
  in over **200ms**.
- **Scrim**, both presentations: `color-mix(in srgb, var(--color-neutral-900) 45%, transparent)`,
  fades in `180ms`, **click to dismiss**.
- Panel background `--color-bg`, `--shadow-lg`. Tall panels: `max-height: 88%; overflow: auto`.
- Escape closes; focus is trapped while open and restored to the opening control on close;
  appropriate dialog semantics (`role="dialog"`, `aria-modal`, `aria-labelledby`) are required
  (FR-RS-023, SC-RS-004). Orientation change while open switches sheet ↔ dialog presentation
  without losing state or trapped focus.

### 5.2 Recipe detail modal

Opened by tapping a planned meal's text region.

- Kicker `<cuisine> · <duration>`; title = meal name (heading font `24px`); description `13.5px`
  muted.
- **Ingredients** section (kicker): rows on `--color-surface`, radius `14px`, padding `11/13px` —
  name (`14px` weight 600), amount (`13px` muted), and a tag: **`In your kitchen`**
  (`tag-accent-2`) when tracked in inventory, else **`Shopping`** (`tag-neutral`).
- **Method** section (kicker): numbered steps, gap `10px` — a `24px` `--color-accent` circle with
  `--color-bg` number (`12px` weight 700), step text `14px`/line-height `1.45`.
  - > Reconciled: item 18 — **REJECTED for now.** The shipped meal model carries only description +
    verified recipe URL; it does not carry step data. Do not build the numbered Method section —
    the modal shows what the model actually has (kicker, title, description, ingredients, footer).
- Footer: full-width secondary `Close` (min-height `48px`).

Reference recipe data (4 illustrative recipes, cuisine/duration/description/ingredients with a
`tracked` flag, each originally with 3 method steps that are **not** to be built per the note
above) — for content-shape reference only, not a fixture:

| Recipe | Cuisine | Duration | Description |
| --- | --- | --- | --- |
| Chicken Adobo | Filipino | 45 min | Braised chicken in soy, vinegar and garlic — a Filipino staple that gets better the longer it sits. |
| Vegetable Fried Rice | Filipino | 20 min | A fast weeknight fry-up that clears the crisper drawer — built to use up your spinach. |
| Tomato Garlic Pasta | Italian | 25 min | A pantry-friendly red-sauce pasta with a lot of garlic and a little chilli. |
| Vegetable Omelette | Western | 10 min | Six eggs on hand — a quick, foldable omelette with whatever veg needs using. |

| Recipe | Ingredients (name — amount — tracked?) |
| --- | --- |
| Chicken Adobo | Chicken Thighs — 1000 g — tracked; Soy Sauce — 80 ml — not tracked; Vinegar — 60 ml — not tracked; Garlic — 6 cloves — not tracked |
| Vegetable Fried Rice | Rice — 2 cups — tracked; Spinach — 1 bunch — tracked; Eggs — 2 count — tracked; Sesame Oil — 1 tbsp — not tracked |
| Tomato Garlic Pasta | Pasta — 250 g — not tracked; Tomatoes — 400 g — not tracked; Garlic — 4 cloves — not tracked |
| Vegetable Omelette | Eggs — 3 count — tracked; Spinach — 1 handful — tracked; Milk — 2 tbsp — tracked |

### 5.3 "Mark cooked" consumption modal

Opened by **Mark cooked** on an *uncooked* meal.

- Title `Cooking <meal>?`; body `How much of each ingredient did you use? We'll update your
  kitchen so your counts stay accurate.` (`13px` muted).
- **One control row per recipe ingredient:** label line = ingredient name (`14px` weight 700) +
  `recipe needs <amount>` (`12px` muted). Below, a 3-part selector (gap `7px`, all radius `12px`,
  border `1.5px`):
  1. **`Used all`** button — fixed width, padding `9px 14px`, `12.5px` weight 700.
  2. **Editable amount control** (`flex: 1`) — label `Used`, then a stepper: `−` (`19px` weight
     700) · value + unit (`14px` weight 700, `min-width: 58px`, centred) · `+`. Interacting selects
     this mode.
  3. **`None`** button — fixed width, same metrics as *Used all*.
  - **Selected** style (whichever of the three is active): bg + border `--color-accent`, text
    `--color-bg`. **Unselected:** transparent bg, border `--color-divider`, text `--color-text`.
- Footer: secondary `Cancel` (min-height `50px`, padding-inline `18px`) + primary
  `Mark as cooked` (`flex: 1`, min-height `50px`, `15px`).
- On confirm, closes and toasts `Cooked <meal> — inventory updated`.

> Reconciled: FR-RS-014 — adopt this **visual treatment only**. The data contract stays exactly as
> shipped in spec `006`: the ingredient rows and their amounts are the **grounded, inventory-clamped
> consumption lines** the server computed (`groundedIngredients` / `ConsumptionReceiptLine`), not
> the prototype's free-form ±0.5-stepper keyed off a static recipe-name lookup. Untracked
> ingredients render **read-only** (they have no inventory line to clamp against). The three-way
> `Used all` / editable / `None` selector maps onto the shipped per-item consumption review, floored
> at 0 and capped at the owned quantity, not an arbitrary ±0.5 step against a hardcoded recipe
> amount. Un-cook remains **receipt-based**: tapping `✓ Cooked` restores exactly from the stored
> consumption receipt, and a legacy receipt-less entry returns 409 rather than being silently
> un-marked, per shipped `006` behaviour — the handoff's "un-marks it directly, no modal" applies
> only for entries that do have a receipt.

### 5.4 Feedback quick-capture overlay

Opened from the floating bubble (touch) / `Tell us` pill (desktop). Same sheet/dialog pattern.

- Title `Tell us anything`; body `A quick note — the assistant tidies it into a report. You'll feel
  heard.`
- Three category tags (gap `8px`, `13px`, padding `8px 14px`, `white-space: nowrap`): `🐞 Bug`
  (`tag-accent`), `💡 Idea` (`tag-accent-2`), `❤️ Love it` (`tag-neutral`). *(These are the only
  intentional emoji in the design.)*
- Input area: `--color-surface`, radius `18px`, padding `14px`, min-height `96px`, placeholder
  `What's on your mind?` — a real, working textarea.
- Full-width primary `Send it` (min-height `50px`).
- On send: closes and shows a **persistent confirmation** — `Thanks — we hear you` pill, bg
  `--color-accent-2-600`, `--color-bg` text, radius `999px`, padding `11px 19px`, `13px` weight
  700, `--shadow-lg`, top-centre (`top: 22px`), with a checkmark icon.

> Reconciled: item 16 — this overlay is **additive quick-capture**, reachable from any screen. It
> does **not** replace the `/feedback` route: the full chat surface, record history, **Promote to
> development**, and the pipeline status view (spec `003` + v4.8.0) remain exactly as shipped and
> reachable at `/feedback`. Nothing shipped there is displaced by this overlay.

---

## 6. Toast

Top-centre (`top: 22px`), bg `--color-neutral-900`, `--color-bg` text, radius `999px`, padding
`11px 19px`, `13px` weight 700, `--shadow-lg`, checkmark icon stroked `--color-accent-2-400`.
**Auto-dismisses after 2200ms** (2400ms for the cook confirmation). Lives in an `aria-live="polite"`
region (FR-RS-025).

Messages: `Added <meal> to <slot>`, `Cooked <meal> — inventory updated`,
`Nice — marked <meal> as cooked`.

---

## 7. Design tokens

From `design/_ds/organic-.../styles.css` (byte-identical to the app's shipped Organic tokens, spec
`010` reconciliation item 1). Use the app's existing CSS custom properties / Tailwind config rather
than pasting hex values into components — this table exists for completeness and traceability.

### 7.1 Core colours

| Token | Hex | Use |
| --- | --- | --- |
| `--color-bg` | `#f5ead8` | app ground; text on accent fills |
| `--color-surface` | `#ebddc5` | cards, sidebar, shelf item chips |
| `--color-text` | `#201e1d` | body text |
| `--color-accent` | `#c67139` | primary terracotta — active nav, primary buttons, urgency |
| `--color-accent-2` | `#7a8a5e` | sage second voice — progress, cooked, "fresh" |
| `--color-divider` | `color-mix(in srgb, #201e1d 16%, transparent)` | borders, rules |

### 7.2 Full ramp steps (100–900)

| Step | Neutral | Accent | Accent-2 |
| --- | --- | --- | --- |
| 100 | `#f9f4ed` | `#fff2eb` | `#f0fae1` |
| 200 | `#eee7db` | `#ffe1d0` | `#e1eecc` |
| 300 | `#dcd3c4` | `#ffc6a5` | `#ccdbb2` |
| 400 | `#c0b6a5` | `#f6a06b` | `#aebf92` |
| 500 | `#a19786` | `#d67f48` | `#8fa073` |
| 600 | `#82796a` | `#b2622d` | `#728157` |
| 700 | `#645c50` | `#8c491a` | `#56633f` |
| 800 | `#474238` | `#643312` | `#3d472b` |
| 900 | `#2e2b25` | `#402310` | `#272e1b` |

> Note: `--color-accent-500` (`#d67f48`) differs from the base `--color-accent` token (`#c67139`).
> Use the base token for primary fills; use ramp steps for hover/tint math.

### 7.3 Muted / disabled text

- **Muted text:** `color-mix(in srgb, var(--color-text) 55%, transparent)`.
- **Struck-through / disabled text:** same mix at `42–50%` opacity.
- **Disabled controls:** `45%` opacity.

### 7.4 Typography

`--font-heading: "Caprasimo"` (weight 400, the only display face — line-height `1.12`,
letter-spacing `-0.015em`); `--font-body: "Figtree"` (base `15px` / line-height `1.55`, weights
400/600/700).

| Role | Size / weight |
| --- | --- |
| Page title | heading, `30px` phone / `38px` iPad / `40px` desktop, line-height `1.06` |
| Section heading | heading, `22px` (`19px` inside cards) |
| Modal title | heading, `22–24px` |
| Stat number | heading, `36px` / line-height `1` |
| Kicker | body, `11px`, weight 700, letter-spacing `.09em`, uppercase, `--color-accent-700` |
| Slot label | body, `10px`, weight 700, letter-spacing `.08em`, uppercase |
| Body | body, `13–15px` |
| Item name | body, `14–15px`, weight 700 |
| Meta / caption | body, `12–13px`, muted |
| Nav label (pill) | body, `10px`, weight 700 |
| Nav label (sidebar) | body, `14px`, weight 700 |

### 7.5 Radii inventory

Tokens: `--radius-sm` `8px` · `--radius-md` `16px` · `--radius-lg` `28px`.

As used across this spec: `999px` (pills, buttons, steppers, nav, tags), `28px` desktop dialog,
`24px` Home banner, `22px` cards/shelves, `20px` grocery group, `18px` meal card & modal input,
`16px` day cell & inner pill-card, `14px` shelf item chip & ingredient row, `12px` consumption
selector, `30px 30px 0 0` bottom sheet.

### 7.6 Spacing

Scale: `--space-1` `4.4px` · `--space-2` `8.8px` · `--space-3` `13.2px` · `--space-4` `17.6px` ·
`--space-6` `26.4px` · `--space-8` `35.2px`. Common ad-hoc gaps used throughout this spec: `7px`,
`8px`, `9px`, `12px`, `14px`, `16px`, `20px`.

### 7.7 Shadows

- `--shadow-sm`: `0 1px 2px color-mix(in srgb, #2e2b25 14%, transparent)` — shelf cards, item chips.
- `--shadow-md`: `0 3px 10px color-mix(in srgb, #2e2b25 16%, transparent)`.
- `--shadow-lg`: `0 12px 32px color-mix(in srgb, #2e2b25 22%, transparent)` — floating nav, bubble,
  modals, toasts.

---

## 8. Icons & assets

- **Icons** — all inline SVG, [Lucide](https://lucide.dev) geometry, **stroke-width 2.5** (2.75 for
  some header/nav glyphs and checkmarks 3–3.4), `fill: none`, round caps/joins. Icons used:
  `refrigerator`, `home`, `calendar`, `shopping-cart`, `message-circle`, `sparkles`, `clock`,
  `chevron-left`, `chevron-right`, `check`. **Use the codebase's `lucide-react` package**, don't
  copy path data.
- **Emoji** — 🐞 💡 ❤️ on the three feedback quick-capture tags only (§5.4); intentional, the only
  emoji in the design.
- **Photography** — none. If imagery is added later (recipe cards being the obvious candidate), the
  Organic system requires the `.washed` wrapper treatment (`filter: saturate(0.6) contrast(0.85)
  brightness(1.1) opacity(0.94)`) with rounded edges.
- **Fonts** — Caprasimo (display) + Figtree (body), loaded by the Organic stylesheet /
  `next/font/google` per `004`.

---

## 9. Accessibility requirements

Framed as build requirements (FR-RS-025, SC-RS-003/004):

- **Real controls, not `div`s with click handlers.** Steppers, day cells, grocery rows, nav items
  and meal cards must be real `<button>` elements, keyboard-operable, with accessible names — e.g.
  "Increase Spinach quantity", "Select Monday 20", "Mark Chicken Adobo as cooked".
- **Grocery checkboxes** must be real checkbox inputs, or `role="checkbox"` + `aria-checked`.
- **Modals** need focus trapping, `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape to close,
  and focus restoration to the opening control on close (§5.1).
- **Toasts** live in an `aria-live="polite"` region (§6).
- **The day strip** (§4.3) is a good candidate for `role="tablist"` semantics or a real date picker.
- **Minimum touch target 44px** in each dimension — audit the stepper `−`/`+` hit areas
  specifically, which are undersized in the source handoff.
- **Visible focus indicator** on every interactive element:
  `outline: 2px solid var(--color-accent); outline-offset: 2px` via `:focus-visible`, never the
  default browser ring.
- **Reduced motion**: all sheet/scrim/sidebar animation (§3) is suppressed under
  `prefers-reduced-motion`.

---

## 10. Explicitly NOT to build

- The prototype's runtime and authoring constructs: `support.js`, `<x-dc>` templates, `<sc-if>` /
  `<sc-for>` control-flow tags, `renderVals()`, `hint-*` attributes (prototype streaming hints —
  ignore entirely), `dc-import` / `x-import`.
- Inline `style="…"` attributes anywhere — reimplement as Tailwind/CSS classes, per the Organic
  system's component classes.
- Device bezels (`ios-frame.jsx`, `browser-window.jsx`) — mockup-only presentation chrome; the real
  app renders full-viewport.
- The recipe modal's numbered **Method** steps (§5.2) — the shipped meal model has no step data;
  out of scope per spec `010`'s Assumptions.
- Route renames (`/fridge`, `/plan`, `/list`) — explicitly deferred (spec `010` reconciliation item
  17, ~27 references across e2e specs and unit tests); this spec keeps existing route paths and
  only changes nav *labels* (§2).
