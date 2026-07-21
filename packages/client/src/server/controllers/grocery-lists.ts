import 'server-only';
import mongoose from 'mongoose';
import { z } from 'zod';
import { GroceryList } from '../models/grocery-list';
import { MealPlan } from '../models/meal-plan';
import { InventoryItem, CATEGORIES, LOCATIONS } from '../models/inventory-item';
import { generateGroceryList } from '../lib/grocery-list-generator';
import { reconcileRollingList, startOfTodayCutoff } from '../lib/rolling-grocery';
import { notExpiredQuery } from '../lib/expiration';
import { applyPurchase, reversePurchase } from '../lib/purchase-inventory';
import { invalidateUser } from '../services/recommendations-cache';
import { GROCERY_CATEGORIES, type IGroceryListItem, type ResolvedPurchaseInput } from '../types/grocery-list';
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
  resolvedPurchase: z
    .object({
      quantity: z.number().positive(),
      unit: z.string().min(1).max(50),
      location: z.enum(LOCATIONS as unknown as [string, ...string[]]),
      expiresAt: z.string().datetime({ offset: true }).optional(),
    })
    .optional(),
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
type CheckoutInventorySummary = Array<{ _id: string; name: string }>;
interface CheckoutAccumulator {
  created: CheckoutInventorySummary;
  updated: CheckoutInventorySummary;
  skipped: number;
  errors: string[];
}

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

function buildArrayItemSetFields(data: PatchItemData): Record<string, unknown> {
  const setFields: Record<string, unknown> = {};
  if (data.displayName !== undefined) setFields['items.$[item].displayName'] = data.displayName;
  if (data.quantity !== undefined) setFields['items.$[item].quantity'] = data.quantity;
  if (data.unit !== undefined) setFields['items.$[item].unit'] = data.unit;
  if (data.category !== undefined) setFields['items.$[item].category'] = data.category;
  if (data.notes !== undefined) setFields['items.$[item].notes'] = data.notes;
  return setFields;
}

function patchedLine<
  T extends {
    displayName: string;
    quantity: number;
    unit: string;
    category: PatchItemData['category'];
  },
>(item: T, data: PatchItemData): T {
  return {
    ...item,
    ...(data.displayName !== undefined ? { displayName: data.displayName } : {}),
    ...(data.quantity !== undefined ? { quantity: data.quantity } : {}),
    ...(data.unit !== undefined ? { unit: data.unit } : {}),
    ...(data.category !== undefined ? { category: data.category } : {}),
  };
}

function resolvedPurchaseInput(data: PatchItemData): ResolvedPurchaseInput | undefined {
  const input = data.resolvedPurchase;
  if (!input) return undefined;
  return {
    quantity: input.quantity,
    unit: input.unit,
    location: input.location as ResolvedPurchaseInput['location'],
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}),
  };
}

function purchaseLineFromItem(item: IGroceryListItem): {
  ingredientName: string;
  displayName: string;
  quantity: number;
  unit: string;
  category: IGroceryListItem['category'];
} {
  return {
    ingredientName: item.ingredientName,
    displayName: item.displayName,
    quantity: item.quantity,
    unit: item.unit,
    category: item.category,
  };
}

async function purchaseGroceryItem(
  userId: string,
  weekStart: Date,
  objectId: mongoose.Types.ObjectId,
  current: IGroceryListItem,
  data: PatchItemData,
): Promise<ControllerResult> {
  const line = patchedLine(
    {
      ingredientName: current.ingredientName,
      displayName: current.displayName,
      quantity: current.quantity,
      unit: current.unit,
      category: current.category,
    },
    data,
  );
  const guarded = await GroceryList.findOneAndUpdate(
    {
      userId,
      weekStart,
      items: {
        $elemMatch: { _id: objectId, isPurchased: false, purchaseReceipt: { $exists: false } },
      },
    },
    {
      $set: {
        ...buildArrayItemSetFields(data),
        'items.$[item].isPurchased': true,
        // Spec 008 US2: day-anchor the row to today in the same write as the tick
        // (FR-RG-005), on the same projected axis as `startOfTodayCutoff()` — see
        // the `addedOn` comment in `addGroceryItem` for why a raw timestamp is wrong.
        'items.$[item].purchasedOn': startOfTodayCutoff(),
      },
    },
    { new: true, arrayFilters: [{ 'item._id': objectId, 'item.isPurchased': false }] },
  );
  if (!guarded) return problem(409, 'Already purchased', 'Grocery item is already purchased');

  const receipt = await applyPurchase(userId, line, resolvedPurchaseInput(data));
  const list = await GroceryList.findOneAndUpdate(
    { userId, weekStart, 'items._id': objectId },
    { $set: { 'items.$.purchaseReceipt': receipt } },
    { new: true },
  );
  invalidateUser(userId);
  return { status: 200, body: { groceryList: list, receipt } };
}

async function unpurchaseGroceryItem(
  userId: string,
  weekStart: Date,
  objectId: mongoose.Types.ObjectId,
  current: IGroceryListItem,
  data: PatchItemData,
): Promise<ControllerResult> {
  if (!current.isPurchased) return problem(409, 'Not purchased', 'Grocery item is not purchased');
  if (!current.purchaseReceipt) {
    return problem(409, 'Cannot reverse without purchase receipt', 'Grocery item has no purchase receipt');
  }

  // {new:false}: reverse from the guard's PRE-IMAGE receipt, not a pre-fetched copy —
  // a losing racer can't reverse a stale receipt (mirrors spec 006's uncookEntry).
  const preImage = await GroceryList.findOneAndUpdate(
    {
      userId,
      weekStart,
      items: { $elemMatch: { _id: objectId, isPurchased: true, purchaseReceipt: { $exists: true } } },
    },
    {
      $set: {
        ...buildArrayItemSetFields(data),
        'items.$[item].isPurchased': false,
      },
      // Spec 008 US2: un-tick clears the day-anchor alongside the receipt.
      $unset: { 'items.$[item].purchaseReceipt': '', 'items.$[item].purchasedOn': '' },
    },
    { new: false, arrayFilters: [{ 'item._id': objectId, 'item.isPurchased': true }] },
  );
  if (!preImage) return problem(409, 'Not purchased', 'Grocery item is not purchased');

  const preItem = preImage.items.find((i) => String(i._id) === String(objectId));
  if (preItem?.purchaseReceipt) await reversePurchase(userId, preItem.purchaseReceipt);

  const list = await GroceryList.findOne({ userId, weekStart });
  invalidateUser(userId);
  return { status: 200, body: { groceryList: list } };
}

async function processCheckoutItem(
  userId: string,
  weekStart: Date,
  item: IGroceryListItem,
  acc: CheckoutAccumulator,
): Promise<boolean> {
  const objectId = item._id;
  if (item.purchaseReceipt) {
    acc.skipped += 1;
    if (!item.isPurchased) {
      await GroceryList.updateOne(
        { userId, weekStart, 'items._id': objectId },
        { $set: { 'items.$.isPurchased': true } },
      );
    }
    return false;
  }

  try {
    const receipt = await applyPurchase(userId, purchaseLineFromItem(item));
    await GroceryList.findOneAndUpdate(
      { userId, weekStart, 'items._id': objectId },
      {
        $set: {
          'items.$.isPurchased': true,
          'items.$.purchaseReceipt': receipt,
          // Spec 008 US2: rows purchased at checkout follow the same daily shed as
          // any tick, stamped on the same projected axis (see `addGroceryItem`).
          'items.$.purchasedOn': startOfTodayCutoff(),
        },
      },
    );
    const inventoryItem = await InventoryItem.findOne({ _id: receipt.inventoryItemId, userId });
    const summary = { _id: receipt.inventoryItemId, name: inventoryItem?.name ?? item.displayName };
    if (receipt.merged) acc.updated.push(summary);
    else acc.created.push(summary);
    return true;
  } catch (err) {
    acc.errors.push(`Failed to add "${item.displayName}": ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
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

  // Spec 008 US1: scope generation to today-onwards and reconcile in place so
  // surviving generated rows keep their _id (FR-RG-001/006/007).
  const asOf = startOfTodayCutoff();
  const inventory = await InventoryItem.find({ userId, ...notExpiredQuery() });
  const { items: generatedItems, generatedAt } = generateGroceryList(mealPlan, inventory, asOf);

  const existing = await GroceryList.findOne({ userId, weekStart });
  // .toObject() → plain items (never spread hydrated subdocs, per the 006 bug).
  const existingItems: IGroceryListItem[] = existing ? existing.toObject().items : [];
  const merged = reconcileRollingList(existingItems, generatedItems, asOf);

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
    // Spec 008 US2: day-anchor the manual row to today (FR-RG-004). Stamped on the
    // same projected UTC-midnight-of-local-day axis as `startOfTodayCutoff()` (not a
    // raw wall-clock timestamp) — comparing a real instant against the projected
    // axis used in reconcileSticky would shed rows within hours of creation in any
    // positive-UTC-offset timezone (contract's example payload confirms midnight).
    addedOn: startOfTodayCutoff(),
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

  const current = existing.items.find((item) => String(item._id) === itemId);
  if (!current) return problem(404, 'Not Found', `No item with id "${itemId}" found`);

  if (parsed.data.isPurchased === true) {
    return purchaseGroceryItem(userId, weekStart, objectId, current, parsed.data);
  }

  if (parsed.data.isPurchased === false) {
    return unpurchaseGroceryItem(userId, weekStart, objectId, current, parsed.data);
  }

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

// POST /:weekStart/complete — purchase remaining receipt-less list items (FR-GC-011)
export async function completeGroceryList(
  userId: string,
  weekStartParam: string,
  body: unknown,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;
  const { weekStart } = parsedWeek;

  const parsed = z.object({ items: z.array(completeItemSchema).optional().default([]) }).safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const list = await GroceryList.findOne({ userId, weekStart });
  if (!list) return problem(404, 'Not Found', 'No grocery list found for this week');

  const acc: CheckoutAccumulator = { created: [], updated: [], skipped: 0, errors: [] };
  let changed = false;

  for (const item of list.items) {
    changed = (await processCheckoutItem(userId, weekStart, item, acc)) || changed;
  }

  if (changed) invalidateUser(userId);
  return { status: 200, body: acc };
}
