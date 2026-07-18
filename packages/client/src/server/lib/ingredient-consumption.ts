import mongoose, { type HydratedDocument } from 'mongoose';
import { logger } from '../logger';
import { InventoryItem, type IInventoryItem } from '../models/inventory-item';
import { notExpiredQuery } from './expiration';
import { normalizeUnit } from './unit-normalizer';
import type { ConsumptionReceiptLine, DepletedItemSnapshot } from '../types/meal-plan';

/**
 * Consumption engine v2 (spec 006 FR-MC-009/012/013, research D7).
 * Deduction happens only at cooked confirmation, applying the USER-CONFIRMED
 * amounts clamped to live stock, and every deduction is recorded on a receipt —
 * including a full snapshot of any item removed by depletion — so un-cook can
 * restore inventory exactly. The old planning-time consume/restore (fixed 1-unit
 * name matching) is gone with its call sites (FR-MC-006).
 */

/** One user-confirmed review line (the PATCH cook body). */
export interface ConsumptionLine {
  inventoryItemId?: string | undefined;
  name: string;
  /** ≥ 0; 0 = "didn't use it" (recorded as not consumed). */
  quantity: number;
  unit?: string | undefined;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

type ItemDoc = HydratedDocument<IInventoryItem>;

async function findTarget(userId: string, line: ConsumptionLine): Promise<ItemDoc | null> {
  if (line.inventoryItemId && mongoose.isValidObjectId(line.inventoryItemId)) {
    // Always user-scoped — a foreign or stale id matches nothing (FR-036/FR-MC-002).
    const byId = await InventoryItem.findOne({ _id: line.inventoryItemId, userId });
    if (byId) return byId;
  }
  const pattern = new RegExp(`^${escapeRegex(line.name)}$`, 'i');
  return InventoryItem.findOne({ userId, name: pattern, ...notExpiredQuery() });
}

/** How much to deduct, in the ITEM's unit. Incompatible units → legacy 1 unit (FR-MC-009). */
function deductionInItemUnit(line: ConsumptionLine, item: ItemDoc): number {
  const lineUnit = line.unit ?? item.unit;
  const asked = normalizeUnit(line.quantity, lineUnit);
  const owned = normalizeUnit(item.quantity, item.unit);
  if (asked.family === 'unknown' || asked.family !== owned.family) return 1;

  const perItemUnit = normalizeUnit(1, item.unit).value;
  return round2(asked.value / perItemUnit);
}

function snapshotOf(item: ItemDoc): DepletedItemSnapshot {
  return {
    name: item.name,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
    location: item.location,
    // expirationStatus deliberately NOT captured — the pre-save hook recomputes it.
    ...(item.expiresAt ? { expiresAt: item.expiresAt } : {}),
  };
}

async function consumeLine(userId: string, line: ConsumptionLine): Promise<ConsumptionReceiptLine> {
  const item = await findTarget(userId, line);
  if (!item) {
    // Matched nothing: deduct nothing, record as not consumed (FR-MC-009/012).
    return { name: line.name, quantityConsumed: 0, unit: line.unit ?? 'units' };
  }

  if (line.quantity === 0) {
    return { inventoryItemId: String(item._id), name: item.name, quantityConsumed: 0, unit: item.unit };
  }

  const deduct = Math.min(deductionInItemUnit(line, item), item.quantity); // clamp to live stock
  const remaining = round2(item.quantity - deduct);

  if (remaining <= 0) {
    const depletedSnapshot = snapshotOf(item);
    await InventoryItem.deleteOne({ _id: item._id });
    return {
      inventoryItemId: String(item._id),
      name: item.name,
      quantityConsumed: item.quantity,
      unit: item.unit,
      depletedSnapshot,
    };
  }

  item.quantity = remaining;
  await item.save();
  return { inventoryItemId: String(item._id), name: item.name, quantityConsumed: deduct, unit: item.unit };
}

/** Apply the confirmed review; returns the receipt (one line per submitted line). */
export async function consumeConfirmed(
  userId: string,
  lines: ConsumptionLine[],
): Promise<ConsumptionReceiptLine[]> {
  const receipt: ConsumptionReceiptLine[] = [];
  for (const line of lines) {
    try {
      receipt.push(await consumeLine(userId, line));
    } catch (err) {
      logger.error({ err, line: line.name }, 'ingredient-consumption: consume failed');
      receipt.push({ name: line.name, quantityConsumed: 0, unit: line.unit ?? 'units' });
    }
  }
  return receipt;
}

/**
 * Exact inverse of a receipt (FR-MC-013): add back what was deducted; re-create
 * depleted items from their snapshots via .save() so the expiration hook runs.
 */
export async function restoreFromReceipt(
  userId: string,
  lines: ConsumptionReceiptLine[],
): Promise<void> {
  for (const line of lines) {
    try {
      await restoreLine(userId, line);
    } catch (err) {
      logger.error({ err, line: line.name }, 'ingredient-consumption: restore failed');
    }
  }
}

async function restoreLine(userId: string, line: ConsumptionReceiptLine): Promise<void> {
  if (line.depletedSnapshot) {
    await new InventoryItem({ userId, ...line.depletedSnapshot }).save();
    return;
  }
  if (!line.inventoryItemId || line.quantityConsumed <= 0) return;

  const item = await InventoryItem.findOne({ _id: line.inventoryItemId, userId });
  if (!item) {
    // Deleted since cooking (externally) and we have no snapshot — nothing safe to recreate.
    logger.warn({ line: line.name }, 'ingredient-consumption: restore target missing');
    return;
  }
  item.quantity = round2(item.quantity + line.quantityConsumed);
  await item.save();
}
