import 'server-only';
import mongoose from 'mongoose';
import { z } from 'zod';
import { InventoryItem, CATEGORIES, LOCATIONS } from '../models/inventory-item';
import { invalidateUser } from '../services/recommendations-cache';
import { getExpirationStatus, expirationStatusQuery } from '../lib/expiration';
import { problem, type ControllerResult } from '../http';

const categoryEnum = z.enum(CATEGORIES as unknown as [string, ...string[]]);
const locationEnum = z.enum(LOCATIONS as unknown as [string, ...string[]]);

const createSchema = z.object({
  name: z.string().min(1).max(100),
  quantity: z.number().nonnegative(),
  unit: z.string().min(1).max(50),
  category: categoryEnum,
  location: locationEnum.default('fridge'),
  expiresAt: z.string().datetime({ offset: true }).optional(),
});

// FR-002 / FR-UI-019 (revised): expiry is UPDATABLE and CLEARABLE — null means
// "remove the expiry date" (item becomes non-perishable, status 'none').
const updateSchema = createSchema.partial().extend({
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

function invalidInput(error: z.ZodError): ControllerResult {
  return problem(400, 'Invalid input', error.issues.map((i) => i.message).join('; '));
}

// GET /api/v1/inventory
export async function listInventory(
  userId: string,
  query: URLSearchParams,
): Promise<ControllerResult> {
  const category = query.get('category') ?? undefined;
  const status = query.get('status') ?? undefined;
  const page = Math.max(1, parseInt(query.get('page') ?? '', 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(query.get('limit') ?? '', 10) || 50));

  const filter: Record<string, unknown> = { userId };
  if (category) filter['category'] = category;
  // Status is DERIVED from expiresAt at query time (the persisted expirationStatus
  // can go stale once an item ages past a boundary — BUG #6). Same for the counts below.
  if (status) Object.assign(filter, expirationStatusQuery(status));

  const [docs, total, expired, expiringSoon] = await Promise.all([
    InventoryItem.find(filter).sort({ expiresAt: 1, name: 1 }).skip((page - 1) * limit).limit(limit),
    InventoryItem.countDocuments(filter),
    InventoryItem.countDocuments({ ...filter, ...expirationStatusQuery('expired') }),
    InventoryItem.countDocuments({ ...filter, ...expirationStatusQuery('expiring-soon') }),
  ]);

  // Recompute expirationStatus on read so responses never serve a stale value.
  const items = docs.map((d) => ({
    ...d.toObject(),
    expirationStatus: getExpirationStatus(d.expiresAt),
  }));

  return {
    status: 200,
    body: {
      items,
      summary: { total, expired, expiringSoon },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    },
  };
}

// POST /api/v1/inventory
export async function createInventory(userId: string, body: unknown): Promise<ControllerResult> {
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const data = parsed.data;
  const item = new InventoryItem({
    ...data,
    userId,
    expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
  });
  await item.save();
  invalidateUser(userId);
  return { status: 201, body: item.toObject() };
}

// PUT /api/v1/inventory/:id
export async function updateInventory(
  userId: string,
  id: string,
  body: unknown,
): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(id)) return problem(400, 'Invalid ID', 'ID is not a valid ObjectId');

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const data = parsed.data;
  const { expiresAt, ...rest } = data;
  // expiresAt: string → set; null → clear ($unset; the model's pre-hook derives
  // expirationStatus for both paths — never set it manually here, see CLAUDE.md §14);
  // absent → untouched.
  const update: Record<string, unknown> =
    expiresAt === null
      ? { $set: { ...rest }, $unset: { expiresAt: 1 } }
      : { ...rest, ...(expiresAt !== undefined ? { expiresAt: new Date(expiresAt) } : {}) };

  const item = await InventoryItem.findOneAndUpdate(
    { _id: id, userId },
    update,
    { new: true, runValidators: true },
  );
  if (!item) return problem(404, 'Not Found', 'Inventory item not found');

  invalidateUser(userId);
  return { status: 200, body: item.toObject() };
}

// DELETE /api/v1/inventory/:id
export async function deleteInventory(userId: string, id: string): Promise<ControllerResult> {
  if (!mongoose.isValidObjectId(id)) return problem(400, 'Invalid ID', 'ID is not a valid ObjectId');

  const item = await InventoryItem.findOneAndDelete({ _id: id, userId });
  if (!item) return problem(404, 'Not Found', 'Inventory item not found');

  invalidateUser(userId);
  return { status: 204, body: null };
}
