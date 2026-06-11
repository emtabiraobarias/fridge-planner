import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { GroceryList } from '../../models/grocery-list.js';
import { MealPlan } from '../../models/meal-plan.js';
import { InventoryItem, CATEGORIES, LOCATIONS } from '../../models/inventory-item.js';
import { problemJson } from '../../lib/errors.js';
import { generateGroceryList } from '../../lib/grocery-list-generator.js';
import { GROCERY_CATEGORIES } from '../../types/grocery-list.js';

export const groceryListsRouter = Router();

type PatchItemData = {
  displayName?: string;
  quantity?: number;
  unit?: string;
  category?: string;
  isPurchased?: boolean;
  notes?: string;
};

function buildItemSetFields(data: PatchItemData): Record<string, unknown> {
  const setFields: Record<string, unknown> = {};
  if (data.displayName !== undefined) setFields['items.$.displayName'] = data.displayName;
  if (data.quantity !== undefined) setFields['items.$.quantity'] = data.quantity;
  if (data.unit !== undefined) setFields['items.$.unit'] = data.unit;
  if (data.category !== undefined) setFields['items.$.category'] = data.category;
  if (data.isPurchased !== undefined) setFields['items.$.isPurchased'] = data.isPurchased;
  if (data.notes !== undefined) setFields['items.$.notes'] = data.notes;
  return setFields;
}

const categoryEnum = z.enum(GROCERY_CATEGORIES as unknown as [string, ...string[]]);

const addItemSchema = z.object({
  displayName: z.string().min(1).max(100),
  quantity: z.number().nonnegative(),
  unit: z.string().min(1).max(50),
  category: categoryEnum,
  notes: z.string().max(500).optional().default(''),
});

const patchItemSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  quantity: z.number().nonnegative().optional(),
  unit: z.string().min(1).max(50).optional(),
  category: categoryEnum.optional(),
  isPurchased: z.boolean().optional(),
  notes: z.string().max(500).optional(),
});

const completeItemSchema = z.object({
  itemId: z.string(),
  name: z.string().min(1).max(100),
  quantity: z.number().positive(),
  unit: z.string().min(1).max(50),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]),
  location: z.enum(LOCATIONS as unknown as [string, ...string[]]).default('fridge'),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

function parseWeekStart(param: string, res: Parameters<typeof problemJson>[0]): Date | null {
  const date = new Date(param);
  if (isNaN(date.getTime())) {
    problemJson(res, 400, 'Bad Request', 'weekStart must be a valid ISO date string');
    return null;
  }
  return date;
}

// GET /api/v1/grocery-lists/:weekStart
// Fetch list; lazily generates from meal plan if not yet created
groceryListsRouter.get('/:weekStart', async (req, res, next) => {
  try {
    const weekStart = parseWeekStart(req.params['weekStart'] ?? '', res);
    if (!weekStart) return;

    const existing = await GroceryList.findOne({ userId: req.userId, weekStart });
    if (existing) {
      res.json({ groceryList: existing });
      return;
    }

    // Lazy generation
    const mealPlan = await MealPlan.findOne({ userId: req.userId, weekStart });
    if (!mealPlan) {
      res.json({ groceryList: null });
      return;
    }

    const inventory = await InventoryItem.find({
      userId: req.userId,
      expirationStatus: { $ne: 'expired' },
    });

    const { items, generatedAt } = generateGroceryList(mealPlan, inventory);

    const list = await GroceryList.findOneAndUpdate(
      { userId: req.userId, weekStart },
      { $set: { items, generatedAt } },
      { upsert: true, new: true },
    );

    res.json({ groceryList: list });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/grocery-lists/:weekStart/generate
// Force-regenerate; preserves manually-added items
groceryListsRouter.post('/:weekStart/generate', async (req, res, next) => {
  try {
    const weekStart = parseWeekStart(req.params['weekStart'] ?? '', res);
    if (!weekStart) return;

    const mealPlan = await MealPlan.findOne({ userId: req.userId, weekStart });
    if (!mealPlan) {
      problemJson(res, 404, 'Not Found', 'No meal plan found for this week');
      return;
    }

    const inventory = await InventoryItem.find({
      userId: req.userId,
      expirationStatus: { $ne: 'expired' },
    });

    const { items: generatedItems, generatedAt } = generateGroceryList(mealPlan, inventory);

    // Preserve manually added items from existing list
    const existing = await GroceryList.findOne({ userId: req.userId, weekStart });
    const manualItems = existing?.items.filter((i) => i.isManuallyAdded) ?? [];

    const merged = [...generatedItems, ...manualItems];

    const list = await GroceryList.findOneAndUpdate(
      { userId: req.userId, weekStart },
      { $set: { items: merged, generatedAt } },
      { upsert: true, new: true },
    );

    res.json({ groceryList: list });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/grocery-lists/:weekStart/items
// Add a manual item
groceryListsRouter.post('/:weekStart/items', async (req, res, next) => {
  try {
    const weekStart = parseWeekStart(req.params['weekStart'] ?? '', res);
    if (!weekStart) return;

    const parsed = addItemSchema.safeParse(req.body);
    if (!parsed.success) {
      problemJson(res, 400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }

    const newItem = {
      ingredientName: parsed.data.displayName.toLowerCase().trim(),
      displayName: parsed.data.displayName,
      quantity: parsed.data.quantity,
      unit: parsed.data.unit,
      category: parsed.data.category,
      isPurchased: false,
      isManuallyAdded: true,
      sourceMealNames: [],
      notes: parsed.data.notes,
    };

    const list = await GroceryList.findOneAndUpdate(
      { userId: req.userId, weekStart },
      { $push: { items: newItem } },
      { upsert: true, new: true },
    );

    res.status(201).json({ groceryList: list });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/v1/grocery-lists/:weekStart/items/:itemId
// Edit item or toggle isPurchased
groceryListsRouter.patch('/:weekStart/items/:itemId', async (req, res, next) => {
  try {
    const weekStart = parseWeekStart(req.params['weekStart'] ?? '', res);
    if (!weekStart) return;

    const { itemId } = req.params;
    if (!itemId || !mongoose.isValidObjectId(itemId)) {
      problemJson(res, 400, 'Invalid ID', 'itemId is not a valid ObjectId');
      return;
    }

    const parsed = patchItemSchema.safeParse(req.body);
    if (!parsed.success) {
      problemJson(res, 400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }

    // Check item exists
    const existing = await GroceryList.findOne({
      userId: req.userId,
      weekStart,
      'items._id': new mongoose.Types.ObjectId(itemId),
    });
    if (!existing) {
      problemJson(res, 404, 'Not Found', `No item with id "${itemId}" found`);
      return;
    }

    const setFields = buildItemSetFields(parsed.data);

    const list = await GroceryList.findOneAndUpdate(
      {
        userId: req.userId,
        weekStart,
        'items._id': new mongoose.Types.ObjectId(itemId),
      },
      { $set: setFields },
      { new: true },
    );

    res.json({ groceryList: list });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/grocery-lists/:weekStart/items/:itemId
// Remove an item
groceryListsRouter.delete('/:weekStart/items/:itemId', async (req, res, next) => {
  try {
    const weekStart = parseWeekStart(req.params['weekStart'] ?? '', res);
    if (!weekStart) return;

    const { itemId } = req.params;
    if (!itemId || !mongoose.isValidObjectId(itemId)) {
      problemJson(res, 400, 'Invalid ID', 'itemId is not a valid ObjectId');
      return;
    }

    const existing = await GroceryList.findOne({
      userId: req.userId,
      weekStart,
      'items._id': new mongoose.Types.ObjectId(itemId),
    });
    if (!existing) {
      problemJson(res, 404, 'Not Found', `No item with id "${itemId}" found`);
      return;
    }

    const list = await GroceryList.findOneAndUpdate(
      { userId: req.userId, weekStart },
      { $pull: { items: { _id: new mongoose.Types.ObjectId(itemId) } } },
      { new: true },
    );

    res.json({ groceryList: list });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/grocery-lists/:weekStart/complete
// Add purchased items to inventory (FR-032)
groceryListsRouter.post('/:weekStart/complete', async (req, res, next) => {
  try {
    const weekStart = parseWeekStart(req.params['weekStart'] ?? '', res);
    if (!weekStart) return;

    const parsed = z.object({ items: z.array(completeItemSchema) }).safeParse(req.body);
    if (!parsed.success) {
      problemJson(res, 400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }

    const created = [];
    const errors: string[] = [];

    for (const item of parsed.data.items) {
      try {
        const invItem = new InventoryItem({
          userId: req.userId,
          name: item.name,
          quantity: item.quantity,
          unit: item.unit,
          category: item.category,
          location: item.location,
          expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
        });
        await invItem.save();
        created.push(invItem);

        // Mark grocery item as purchased
        await GroceryList.findOneAndUpdate(
          {
            userId: req.userId,
            weekStart,
            'items._id': new mongoose.Types.ObjectId(item.itemId),
          },
          { $set: { 'items.$.isPurchased': true } },
        );
      } catch (err) {
        errors.push(`Failed to add "${item.name}": ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    res.json({ created, errors });
  } catch (err) {
    next(err);
  }
});
