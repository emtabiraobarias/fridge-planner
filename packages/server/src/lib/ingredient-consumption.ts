import { logger } from '../app.js';
import { InventoryItem } from '../models/inventory-item.js';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function consumeOne(userId: string, ingredientName: string): Promise<void> {
  const pattern = new RegExp(`^${escapeRegex(ingredientName)}$`, 'i');
  const item = await InventoryItem.findOne({
    userId,
    name: pattern,
    expirationStatus: { $ne: 'expired' },
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
