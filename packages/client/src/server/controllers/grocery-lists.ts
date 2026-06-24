import 'server-only';
import mongoose from 'mongoose';
import { z } from 'zod';
import { GroceryList } from '../models/grocery-list';
import { MealPlan } from '../models/meal-plan';
import { InventoryItem, CATEGORIES, LOCATIONS } from '../models/inventory-item';
import { generateGroceryList } from '../lib/grocery-list-generator';
import { notExpiredQuery } from '../lib/expiration';
import { GROCERY_CATEGORIES } from '../types/grocery-list';
import { problem, type ControllerResult } from '../http';

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

type PatchItemData = z.infer<typeof patchItemSchema>;

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

/** Parse the :weekStart path param, or return a 400 ControllerResult. */
function parseWeekStart(param: string): { weekStart: Date } | { error: ControllerResult } {
  const date = new Date(param);
  if (isNaN(date.getTime())) {
    return { error: problem(400, 'Bad Request', 'weekStart must be a valid ISO date string') };
  }
  return { weekStart: date };
}

function invalidInput(error: z.ZodError): ControllerResult {
  return problem(400, 'Invalid input', error.issues.map((i) => i.message).join('; '));
}

// GET /api/v1/grocery-lists/:weekStart — fetch; lazily generate from meal plan if absent
export async function getGroceryList(userId: string, weekStartParam: string): Promise<ControllerResult> {
  const parsed = parseWeekStart(weekStartParam);
  if ('error' in parsed) return parsed.error;
  const { weekStart } = parsed;

  const existing = await GroceryList.findOne({ userId, weekStart });
  if (existing) return { status: 200, body: { groceryList: existing } };

  const mealPlan = await MealPlan.findOne({ userId, weekStart });
  if (!mealPlan) return { status: 200, body: { groceryList: null } };

  const inventory = await InventoryItem.find({ userId, ...notExpiredQuery() });
  const { items, generatedAt } = generateGroceryList(mealPlan, inventory);

  const list = await GroceryList.findOneAndUpdate(
    { userId, weekStart },
    { $set: { items, generatedAt } },
    { upsert: true, new: true },
  );
  return { status: 200, body: { groceryList: list } };
}

// POST /:weekStart/generate — force-regenerate; preserves manually-added items
export async function regenerateGroceryList(userId: string, weekStartParam: string): Promise<ControllerResult> {
  const parsed = parseWeekStart(weekStartParam);
  if ('error' in parsed) return parsed.error;
  const { weekStart } = parsed;

  const mealPlan = await MealPlan.findOne({ userId, weekStart });
  if (!mealPlan) return problem(404, 'Not Found', 'No meal plan found for this week');

  const inventory = await InventoryItem.find({ userId, ...notExpiredQuery() });
  const { items: generatedItems, generatedAt } = generateGroceryList(mealPlan, inventory);

  const existing = await GroceryList.findOne({ userId, weekStart });
  const manualItems = existing?.items.filter((i) => i.isManuallyAdded) ?? [];
  const merged = [...generatedItems, ...manualItems];

  const list = await GroceryList.findOneAndUpdate(
    { userId, weekStart },
    { $set: { items: merged, generatedAt } },
    { upsert: true, new: true },
  );
  return { status: 200, body: { groceryList: list } };
}

// POST /:weekStart/items — add a manual item
export async function addGroceryItem(
  userId: string,
  weekStartParam: string,
  body: unknown,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;

  const parsed = addItemSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

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
    { userId, weekStart: parsedWeek.weekStart },
    { $push: { items: newItem } },
    { upsert: true, new: true },
  );
  return { status: 201, body: { groceryList: list } };
}

// PATCH /:weekStart/items/:itemId — edit item or toggle isPurchased
export async function patchGroceryItem(
  userId: string,
  weekStartParam: string,
  itemId: string,
  body: unknown,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;
  const { weekStart } = parsedWeek;

  if (!mongoose.isValidObjectId(itemId)) {
    return problem(400, 'Invalid ID', 'itemId is not a valid ObjectId');
  }

  const parsed = patchItemSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const objectId = new mongoose.Types.ObjectId(itemId);
  const existing = await GroceryList.findOne({ userId, weekStart, 'items._id': objectId });
  if (!existing) return problem(404, 'Not Found', `No item with id "${itemId}" found`);

  const list = await GroceryList.findOneAndUpdate(
    { userId, weekStart, 'items._id': objectId },
    { $set: buildItemSetFields(parsed.data) },
    { new: true },
  );
  return { status: 200, body: { groceryList: list } };
}

// DELETE /:weekStart/items/:itemId — remove an item
export async function deleteGroceryItem(
  userId: string,
  weekStartParam: string,
  itemId: string,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;
  const { weekStart } = parsedWeek;

  if (!mongoose.isValidObjectId(itemId)) {
    return problem(400, 'Invalid ID', 'itemId is not a valid ObjectId');
  }

  const objectId = new mongoose.Types.ObjectId(itemId);
  const existing = await GroceryList.findOne({ userId, weekStart, 'items._id': objectId });
  if (!existing) return problem(404, 'Not Found', `No item with id "${itemId}" found`);

  const list = await GroceryList.findOneAndUpdate(
    { userId, weekStart },
    { $pull: { items: { _id: objectId } } },
    { new: true },
  );
  return { status: 200, body: { groceryList: list } };
}

// POST /:weekStart/complete — add purchased items to inventory (FR-032)
export async function completeGroceryList(
  userId: string,
  weekStartParam: string,
  body: unknown,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;
  const { weekStart } = parsedWeek;

  const parsed = z.object({ items: z.array(completeItemSchema) }).safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const created = [];
  const errors: string[] = [];

  for (const item of parsed.data.items) {
    try {
      const invItem = new InventoryItem({
        userId,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
        category: item.category,
        location: item.location,
        expiresAt: item.expiresAt ? new Date(item.expiresAt) : undefined,
      });
      await invItem.save();
      created.push(invItem);

      await GroceryList.findOneAndUpdate(
        { userId, weekStart, 'items._id': new mongoose.Types.ObjectId(item.itemId) },
        { $set: { 'items.$.isPurchased': true } },
      );
    } catch (err) {
      errors.push(`Failed to add "${item.name}": ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { status: 200, body: { created, errors } };
}
