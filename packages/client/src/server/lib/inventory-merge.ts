import 'server-only';
import { InventoryItem, type InventoryItemDocument } from '../models/inventory-item';
import { notExpiredQuery } from './expiration';
import { normalizeIngredientName } from './ingredient-matcher';
import { canSubtract, normalizeUnit, resolveAlias } from './unit-normalizer';

/**
 * Shared same-name/unit-compatible merge matcher (spec 007 FR-GC-005), extracted
 * from `purchase-inventory.ts` for reuse by spec 009's quick-add merge (research
 * D6, T030) — pure lift, no behaviour change (guarded by T027's regression test).
 */

function sameIngredient(a: string, b: string): boolean {
  return normalizeIngredientName(a) === normalizeIngredientName(b);
}

function isSameResolvedUnit(unitA: string, unitB: string): boolean {
  return resolveAlias(unitA) === resolveAlias(unitB);
}

export function canMergeUnits(unitA: string, unitB: string): boolean {
  return canSubtract(unitA, unitB) || isSameResolvedUnit(unitA, unitB);
}

export function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  if (isSameResolvedUnit(fromUnit, toUnit)) return quantity;
  const from = normalizeUnit(quantity, fromUnit);
  const targetOne = normalizeUnit(1, toUnit);
  if (from.family !== targetOne.family || targetOne.value === 0) return quantity;
  return Math.round((from.value / targetOne.value) * 100) / 100;
}

/** Live, non-expired same-name candidates for `userId` (any unit — filtering by unit is the caller's job). */
export async function sameNameCandidates(
  userId: string,
  displayName: string,
): Promise<InventoryItemDocument[]> {
  const candidates = await InventoryItem.find({ userId, ...notExpiredQuery() });
  return candidates.filter((item) => sameIngredient(item.name, displayName)) as InventoryItemDocument[];
}

/**
 * A same-name, non-expired, unit-compatible inventory item to merge a new
 * quantity into — or `null` when no such item exists (expired/unit-incompatible
 * same-name items are never targets, spec 007 FR-GC-005 semantics).
 */
export async function findMergeTarget(
  userId: string,
  name: string,
  unit: string,
): Promise<InventoryItemDocument | null> {
  const candidates = await sameNameCandidates(userId, name);
  return candidates.find((item) => canMergeUnits(unit, item.unit)) ?? null;
}

/**
 * Increments `target`'s quantity by `quantity quantity-unit` (converted to the
 * target's unit), persists it, and returns the added amount in the target's unit.
 */
export async function mergeInto(
  target: InventoryItemDocument,
  quantity: number,
  unit: string,
): Promise<number> {
  const quantityAdded = convertQuantity(quantity, unit, target.unit);
  target.quantity = Math.round((target.quantity + quantityAdded) * 100) / 100;
  await target.save();
  return quantityAdded;
}
