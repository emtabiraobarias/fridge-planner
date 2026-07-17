# Data Model — Inventory-Grounded Meal Consumption (`impl/nextjs`)

Phase 1 output. Storage is MongoDB via Mongoose; no new collection — this feature extends the `meal_plans` entry subdocument, the `MealRecommendation` shape, and the spec-005 `ingredient_aliases` collection.

## GroundedIngredient (embedded in MealRecommendation)

The from-inventory ingredient shape the agent returns and the server validates (D1/D2).

```typescript
interface GroundedIngredient {
  inventoryItemId?: string;   // validated {_id, userId}-scoped; absent when resolved by name only
  name: string;               // display name (agent's wording)
  quantityToConsume?: number; // positive, clamped ≤ owned at delivery; absent = unquantified (legacy 1-unit rule)
  unit?: string;              // item's unit or convertible (unit-normalizer family)
  resolution: 'direct' | 'fuzzy' | 'alias' | 'unresolved';
}
```

- `MealRecommendation` gains `groundedIngredients?: GroundedIngredient[]`; the legacy `usesIngredients: string[]` remains, derived from grounded names (back-compat for every existing consumer, incl. stored meal snapshots).
- `resolution:'unresolved'` entries are display-only; their names join `missingIngredients`.
- Validation (zod, in `ingredient-grounding.ts`): array ≤ 20; name 1–100 chars; amount finite & > 0 else dropped; unit ≤ 20 chars; unknown fields stripped.

## MealPlan entry subdocument (extended)

```typescript
interface IMealPlanEntry {
  slotId: string;
  date: Date;
  mealType: MealType;
  meal: MealRecommendation;            // Mixed snapshot (old + new shapes coexist)
  status?: 'planned' | 'cooked';       // ABSENT = legacy = cooked (FR-MC-011); new writes always set it
  cookedAt?: Date;                     // set on cook, cleared on un-cook
  consumedItems?: ConsumptionReceiptLine[]; // the receipt; present iff cooked via the new flow
}
```

**Effective-status rule** (single helper, used everywhere): `entryStatus(e) = e.status ?? 'cooked'`.

**State transitions**:

| From | Action | Guard (atomic, in the update filter) | To | Side effects |
|------|--------|--------------------------------------|----|--------------|
| planned | `cook` | `status:'planned'` matched | cooked | deduct confirmed amounts → write receipt + `cookedAt`; invalidate recs cache |
| cooked (with receipt) | `uncook` | `status:'cooked'` ∧ `consumedItems` exists | planned | restore from receipt (incl. re-create depleted items); clear receipt + `cookedAt`; invalidate recs cache |
| cooked (legacy, no receipt) | `uncook` | fails guard | — | 409 `cannot un-cook a pre-existing entry` |
| planned | `cook` (repeat/concurrent) | fails guard | — | 409 `already cooked`; zero deduction (SC-MC-003) |
| any | DELETE / PUT replace / move | n/a | entry removed/kept | **no inventory effect** (FR-MC-006/014); PUT preserves server-held `status`/`cookedAt`/`consumedItems` by `slotId` and ignores client-sent lifecycle fields |

## ConsumptionReceiptLine (embedded on the entry)

```typescript
interface ConsumptionReceiptLine {
  inventoryItemId: string;      // the item that was deducted
  name: string;                 // display name at cook time
  quantityConsumed: number;     // actual deducted (user-confirmed, clamped live); 0 = marked not consumed
  unit: string;
  depletedSnapshot?: {          // present iff the deduction removed the item
    name: string;
    quantity: number;           // quantity at deletion time (== what restore re-creates, pre-deduction)
    unit: string;
    category: string;
    location: string;
    expiresAt?: Date;
    // expirationStatus deliberately EXCLUDED — the pre-save hook recomputes it on restore (§14)
  };
}
```

- Receipts are 1:1 with a cooked entry, ≤ ~15 lines, embedded (D7 — no separate collection).
- Restore semantics: increment `quantityConsumed` back onto the item if it still exists; else `new InventoryItem({userId, ...depletedSnapshot}).save()`.

## IngredientAlias (spec-005 model, extended)

```typescript
interface IIngredientAlias {
  userId: string;
  nameKey: string;              // normalized ingredient name (existing unique {userId, nameKey})
  category?: string;            // spec-005 fields, unchanged
  location?: string;
  unit?: string;
  expiryObservations: number[];
  inventoryName?: string;       // NEW — learned pairing: canonical inventory item NAME this ingredient maps to
}
```

- Pairing stores the **name**, not an `_id` (items are deleted/recreated by depletion + restore; names are the stable per-user vocabulary). Tier-3 resolution: alias hit → re-resolve `inventoryName` against live inventory via tier-2 matching.
- Written by `alias-pairing.ts` on an LLM-confirmed match; only ever supplies a mapping — never blocks (FR-MC-004).

## Client mirrors

`src/types/meal-plan.ts` and `src/types/meal-recommendation.ts` mirror the server types (status, cookedAt, consumedItems, groundedIngredients) so `MealPlanContext`, the calendar tiles, the detail modal, and the review sheet are fully typed. Client never computes consumption — it displays server responses.

## Indexes & volume

No new indexes: entry lifecycle rides the existing `{userId, weekStart}` unique index; alias pairing rides `{userId, nameKey}`. Receipt payload adds ≤ a few KB per cooked entry.
