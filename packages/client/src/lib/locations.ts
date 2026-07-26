import type { Location } from '../services/inventory';

/**
 * The three shipped storage locations, in shelf/display order. Mirrors `LOCATIONS`
 * in `src/server/models/inventory-item.ts:9` — the single client-side copy (spec
 * 010 research D7): the Kitchen's per-location `Shelf` grid (`InventoryPage.tsx`)
 * and the `EditItemSheet` location picker both read from here so the list is
 * never re-typed a third time.
 */
export const LOCATIONS: readonly Location[] = ['fridge', 'freezer', 'pantry'];

export const LOCATION_LABEL: Record<Location, string> = {
  fridge: 'Fridge',
  freezer: 'Freezer',
  pantry: 'Pantry',
};

/** Type guard narrowing an arbitrary string down to a known `Location`. */
export function isKnownLocation(location: string): location is Location {
  return (LOCATIONS as readonly string[]).includes(location);
}

/**
 * Group items into one bucket per known `Location` (always present, even at
 * zero items) plus a `fallback` bucket for any out-of-enum location value —
 * never dropped (spec 010 D7, FR-RS-008). Pure so `InventoryPage` stays a thin
 * caller rather than carrying the loop's branching in its own complexity.
 */
export function groupByLocation<T extends { location: string }>(
  items: readonly T[],
): { byLocation: Map<Location, T[]>; fallback: T[] } {
  const byLocation = new Map<Location, T[]>(LOCATIONS.map((loc) => [loc, [] as T[]]));
  const fallback: T[] = [];
  for (const item of items) {
    if (isKnownLocation(item.location)) byLocation.get(item.location)!.push(item);
    else fallback.push(item);
  }
  return { byLocation, fallback };
}
