import 'server-only';
import type { IGroceryListItem, PurchaseReceipt, ResolvedPurchaseInput } from '../types/grocery-list';
import { IngredientAlias } from '../models/ingredient-alias';
import { InventoryItem, type InventoryItemDocument, type Location } from '../models/inventory-item';
import { notExpiredQuery } from './expiration';
import { normalizeIngredientName } from './ingredient-matcher';
import { canSubtract, normalizeUnit, resolveAlias } from './unit-normalizer';
import { defaultLocationForCategory } from '../../lib/category-location';

interface PurchaseLine {
  ingredientName: string;
  displayName: string;
  quantity: number;
  unit: string;
  category: IGroceryListItem['category'];
}

interface ResolvedPurchase {
  quantity: number;
  unit: string;
  location: Location;
  expiresAt?: Date;
}

function aliasKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function sameIngredient(a: string, b: string): boolean {
  return normalizeIngredientName(a) === normalizeIngredientName(b);
}

function isSameResolvedUnit(unitA: string, unitB: string): boolean {
  return resolveAlias(unitA) === resolveAlias(unitB);
}

function canMergeUnits(unitA: string, unitB: string): boolean {
  return canSubtract(unitA, unitB) || isSameResolvedUnit(unitA, unitB);
}

function convertQuantity(quantity: number, fromUnit: string, toUnit: string): number {
  if (isSameResolvedUnit(fromUnit, toUnit)) return quantity;
  const from = normalizeUnit(quantity, fromUnit);
  const targetOne = normalizeUnit(1, toUnit);
  if (from.family !== targetOne.family || targetOne.value === 0) return quantity;
  return Math.round((from.value / targetOne.value) * 100) / 100;
}

async function sameNameCandidates(userId: string, displayName: string): Promise<InventoryItemDocument[]> {
  const candidates = await InventoryItem.find({ userId, ...notExpiredQuery() });
  return candidates.filter((item) => sameIngredient(item.name, displayName)) as InventoryItemDocument[];
}

async function learnedUnit(userId: string, displayName: string): Promise<string | null> {
  const alias = await IngredientAlias.findOne({ userId, nameKey: aliasKey(displayName) });
  return alias?.unit ?? null;
}

function resolvedPurchaseInput(
  resolved: ResolvedPurchaseInput,
  sameName: InventoryItemDocument[],
): { purchase: ResolvedPurchase; mergeTarget: InventoryItemDocument | null } {
  return {
    purchase: {
      quantity: resolved.quantity,
      unit: resolved.unit,
      location: resolved.location,
      ...(resolved.expiresAt ? { expiresAt: new Date(resolved.expiresAt) } : {}),
    },
    mergeTarget: sameName.find((item) => canMergeUnits(resolved.unit, item.unit)) ?? null,
  };
}

async function servingsPurchase(
  userId: string,
  line: PurchaseLine,
  sameName: InventoryItemDocument[],
): Promise<{ purchase: ResolvedPurchase; mergeTarget: InventoryItemDocument | null }> {
  const mergeTarget = sameName[0] ?? null;
  if (mergeTarget) {
    return {
      purchase: { quantity: line.quantity, unit: mergeTarget.unit, location: mergeTarget.location },
      mergeTarget,
    };
  }
  return {
    purchase: {
      quantity: line.quantity,
      unit: (await learnedUnit(userId, line.displayName)) ?? 'count',
      location: defaultLocationForCategory(line.category),
    },
    mergeTarget: null,
  };
}

function realAmountPurchase(
  line: PurchaseLine,
  sameName: InventoryItemDocument[],
): { purchase: ResolvedPurchase; mergeTarget: InventoryItemDocument | null } {
  const mergeTarget = sameName.find((item) => canMergeUnits(line.unit, item.unit)) ?? null;
  return {
    purchase: {
      quantity: line.quantity,
      unit: line.unit,
      location: mergeTarget?.location ?? defaultLocationForCategory(line.category),
    },
    mergeTarget,
  };
}

async function resolvePurchase(
  userId: string,
  line: PurchaseLine,
  resolved?: ResolvedPurchaseInput,
): Promise<{ purchase: ResolvedPurchase; mergeTarget: InventoryItemDocument | null }> {
  const sameName = await sameNameCandidates(userId, line.displayName);
  if (resolved) return resolvedPurchaseInput(resolved, sameName);
  if (line.unit === 'servings') return servingsPurchase(userId, line, sameName);
  return realAmountPurchase(line, sameName);
}

export async function applyPurchase(
  userId: string,
  line: PurchaseLine,
  resolved?: ResolvedPurchaseInput,
): Promise<PurchaseReceipt> {
  const { purchase, mergeTarget } = await resolvePurchase(userId, line, resolved);

  if (mergeTarget) {
    const quantityAdded = convertQuantity(purchase.quantity, purchase.unit, mergeTarget.unit);
    mergeTarget.quantity = Math.round((mergeTarget.quantity + quantityAdded) * 100) / 100;
    await mergeTarget.save();
    return {
      inventoryItemId: String(mergeTarget._id),
      quantityAdded,
      unit: mergeTarget.unit,
      merged: true,
    };
  }

  const item = new InventoryItem({
    userId,
    name: line.displayName,
    quantity: purchase.quantity,
    unit: purchase.unit,
    category: line.category,
    location: purchase.location,
    ...(purchase.expiresAt ? { expiresAt: purchase.expiresAt } : {}),
  });
  await item.save();

  return {
    inventoryItemId: String(item._id),
    quantityAdded: item.quantity,
    unit: item.unit,
    merged: false,
  };
}

export async function reversePurchase(userId: string, receipt: PurchaseReceipt): Promise<void> {
  const item = await InventoryItem.findOne({ _id: receipt.inventoryItemId, userId });
  if (!item) return;

  if (item.quantity <= receipt.quantityAdded) {
    await InventoryItem.deleteOne({ _id: item._id, userId });
    return;
  }

  item.quantity = Math.round((item.quantity - receipt.quantityAdded) * 100) / 100;
  await item.save();
}
