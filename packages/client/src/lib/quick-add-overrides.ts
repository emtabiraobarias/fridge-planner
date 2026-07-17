import type { ParsedQuickItem } from './quick-parse';

/**
 * Per-field correction overrides for the quick-add preview (spec 005 US2, research D3).
 *
 * Overrides are keyed by the item's parsed name (lowercased) — never by segment
 * position — so multi-item re-splits re-associate them by name. Each override
 * records the parsed value it replaced: on re-parse it is kept while the fresh
 * parse still yields that value for the field, and dropped when the fresh value
 * differs (the user's newer text wins, FR-IQ-014).
 */

export type OverridableField = 'quantity' | 'unit' | 'category' | 'location' | 'expiresAt';

type FieldValue = string | number | null;

export interface FieldOverride {
  value: FieldValue;
  replaced: FieldValue;
}

export type OverrideMap = Record<string, Partial<Record<OverridableField, FieldOverride>>>;

export interface ApplyResult {
  items: ParsedQuickItem[];
  /** The surviving overrides — stale entries (vanished item / changed parse) pruned. */
  overrides: OverrideMap;
}

function nameKey(name: string): string {
  return name.toLowerCase().trim();
}

/** Record a correction for one field of one parsed item (returns a new map). */
export function setOverride(
  map: OverrideMap,
  item: ParsedQuickItem,
  field: OverridableField,
  value: FieldValue,
): OverrideMap {
  const key = nameKey(item.name);
  return {
    ...map,
    [key]: { ...map[key], [field]: { value, replaced: item[field] } },
  };
}

function applyToItem(
  item: ParsedQuickItem,
  fields: Partial<Record<OverridableField, FieldOverride>>,
): { item: ParsedQuickItem; surviving: Partial<Record<OverridableField, FieldOverride>> } {
  const out: ParsedQuickItem = { ...item, provenance: { ...item.provenance } };
  const surviving: Partial<Record<OverridableField, FieldOverride>> = {};
  for (const [field, override] of Object.entries(fields) as [OverridableField, FieldOverride][]) {
    if (item[field] !== override.replaced) continue; // fresh text changed this field — text wins
    (out as unknown as Record<OverridableField, FieldValue>)[field] = override.value;
    out.provenance[field] = 'explicit';
    surviving[field] = override;
  }
  return { item: out, surviving };
}

/** Apply surviving overrides to freshly parsed items; prune the stale ones. */
export function applyOverrides(items: ParsedQuickItem[], map: OverrideMap): ApplyResult {
  const overrides: OverrideMap = {};
  const applied = items.map((item) => {
    const fields = map[nameKey(item.name)];
    if (!fields) return item;
    const { item: next, surviving } = applyToItem(item, fields);
    if (Object.keys(surviving).length > 0) overrides[nameKey(item.name)] = surviving;
    return next;
  });
  return { items: applied, overrides };
}
