# Data Model — Intelligent Quick-Add Understanding (`impl/nextjs`)

Phase 1 output. One new persisted entity (IQ3); the rest are client-side shapes.

## Persisted: IngredientAlias (MongoDB, collection `ingredient_aliases`)

Per-user learned defaults for an item name as typed. Created/updated by chip corrections and by adds that carry an expiry; read once per session into the client alias cache. **Never blocks or corrupts a parse — supplies tentative defaults only** (FR-IQ-018).

```typescript
{
  userId: string;                 // indexed; FR-036 isolation — every query scoped
  nameKey: string;                // lowercased, whitespace-collapsed item name as typed
  category?: Category;            // learned from corrections (existing enum)
  location?: Location;            // learned from corrections (existing enum)
  unit?: string;                  // learned preferred unit (existing canonical units)
  expiryObservations: number[];   // days-until-expiry at add time; FIFO, max 5
  createdAt: Date;                // timestamps: true
  updatedAt: Date;
}
```

- **Indexes**: unique compound `(userId, nameKey)`.
- **Validation** (Zod at the route boundary): `nameKey` non-empty ≤100 chars; `category`/`location`/`unit` must be members of the existing enums; `observedShelfLifeDays` integer 0–365.
- **Write paths**:
  - Chip correction (category/location/unit) → `PUT /quick-add/aliases/:nameKey` upserts that field (overwrite, not accumulate).
  - Add with an **explicitly typed or chip-corrected** expiry → same PUT with `observedShelfLifeDays`; server pushes into `expiryObservations`, trimming to the newest 5. **Suggestion-accepted expiries are NOT recorded** — feeding the median back to itself would freeze the observation window on its own echo (analyze U2).
- **Derived value**: `suggestedShelfLifeDays` = median of `expiryObservations` when `length ≥ 2`, else absent (computed in the controller for GET responses; not stored).
- **Lifecycle**: no expiry/TTL — an alias is tiny and remains valid until overwritten. Deletion is out of scope (a re-correction overwrites).
- **Relationship note**: intentionally shares the collection name planned by roadmap backlog #2 (ingredient↔inventory mapping); #2 may extend this document shape later — nothing here assumes it.

## Client-side: ParsedQuickItem (extends spec-004's ParsedQuick)

```typescript
type Provenance = 'explicit' | 'learned' | 'assisted' | 'guess';

interface ParsedQuickItem {
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  location: Location;
  expiresAt: string | null;          // yyyy-mm-dd
  suggestedExpiresAt?: string;       // from alias shelf-life; applied only on tap (FR-IQ-017)
  provenance: {
    quantity: Provenance;
    unit: Provenance;
    category: Provenance;
    location: Provenance;
    expiresAt: Provenance;           // 'explicit' when parsed from text; 'guess' when null/suggested
  };
}
```

- `parseQuick` (deterministic) emits only `explicit` / `guess`.
- Alias merge upgrades `guess` → `learned`; assist merge upgrades remaining `guess` → `assisted`. Neither ever changes an `explicit` field (precedence, FR-IQ-016/020).
- `parseQuickAll(text): ParsedQuickItem[]` — comma-split; empty and bare-number segments dropped (FR-IQ-006).

## Client-side: correction overrides (component state, IQ2)

```typescript
interface FieldOverride<T> { value: T; replaced: T }   // replaced = parsed value at correction time
type Overrides = Partial<{ quantity; unit; category; location; expiresAt }>;  // FieldOverride each
```

Merge rule (research D3): on re-parse, keep an override while the fresh parse still yields `replaced` for that field; drop it when the fresh value differs (new text wins). Overrides are keyed by the item's parsed name (case-insensitive), so re-splitting multi-item text re-associates them by name and drops any override whose item disappeared. Overridden fields render and submit as `explicit`.

## State transitions

```
typed text ──parseQuickAll──▶ deterministic items (explicit/guess)
        └─ alias cache merge ─▶ learned fields          (IQ3)
        └─ low-confidence? ──▶ assist merge ─▶ assisted fields   (IQ4, async, fail-open)
user taps chip ─▶ override (explicit) ─▶ PUT alias (learnable fields)   (IQ2→IQ3)
user submits ─▶ existing add flows (inventory POST / grocery item add) — payloads unchanged
```

No changes to InventoryItem, MealPlan, or GroceryList models; the quick-add continues to emit payloads the existing endpoints already accept (spec assumption: no server-contract change for P1/P2).
