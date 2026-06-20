import { logger } from '../app.js';
import { InventoryItem } from '../models/inventory-item.js';
import { notExpiredQuery } from './expiration.js';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function consumeOne(userId: string, ingredientName: string): Promise<void> {
  const pattern = new RegExp(`^${escapeRegex(ingredientName)}$`, 'i');
  const item = await InventoryItem.findOne({
    userId,
    name: pattern,
    ...notExpiredQuery(),
  });

  if (!item) return;

  if (item.quantity <= 1) {
    await InventoryItem.deleteOne({ _id: item._id });
  } else {
    item.quantity -= 1;
    await item.save();
  }
}

export async function consumeIngredients(
  userId: string,
  ingredientNames: string[],
): Promise<void> {
  try {
    await Promise.all(ingredientNames.map((name) => consumeOne(userId, name)));
  } catch (err) {
    logger.error({ err }, 'ingredient-consumption: unexpected error');
  }
}

async function restoreOne(userId: string, ingredientName: string): Promise<void> {
  const pattern = new RegExp(`^${escapeRegex(ingredientName)}$`, 'i');
  const item = await InventoryItem.findOne({ userId, name: pattern, ...notExpiredQuery() });
  // Known limitation: an item consumed down to deletion can't be faithfully recreated here
  // (its unit/category/location are gone), so restore is a no-op in that case.
  if (!item) return;
  item.quantity += 1;
  await item.save();
}

/**
 * Inverse of consumeIngredients — increments matching inventory by 1 per name. Used to keep
 * inventory in sync with the plan when a planned meal is removed or replaced (BUG #7, FR-005).
 */
export async function restoreIngredients(
  userId: string,
  ingredientNames: string[],
): Promise<void> {
  try {
    await Promise.all(ingredientNames.map((name) => restoreOne(userId, name)));
  } catch (err) {
    logger.error({ err }, 'ingredient-consumption: unexpected restore error');
  }
}
