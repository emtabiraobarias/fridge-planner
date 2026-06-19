import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { InventoryItem, CATEGORIES, LOCATIONS } from '../../models/inventory-item.js';
import { invalidateUser } from '../../services/recommendations-cache.js';
import { problemJson } from '../../lib/errors.js';
import { getExpirationStatus, expirationStatusQuery } from '../../lib/expiration.js';

export const inventoryRouter = Router();

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

const updateSchema = createSchema.partial();

// GET /api/v1/inventory
inventoryRouter.get('/', async (req, res, next) => {
  try {
    const { category, status } = req.query as Record<string, string | undefined>;
    const page = Math.max(1, parseInt(req.query['page'] as string, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(req.query['limit'] as string, 10) || 50));
    const filter: Record<string, unknown> = { userId: req.userId };
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

    res.json({
      items,
      summary: { total, expired, expiringSoon },
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/inventory
inventoryRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      problemJson(res, 400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    const data = parsed.data;
    const item = new InventoryItem({
      ...data,
      userId: req.userId,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });
    await item.save();
    invalidateUser(req.userId);
    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/inventory/:id
inventoryRouter.put('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params['id'])) {
      problemJson(res, 400, 'Invalid ID', 'ID is not a valid ObjectId');
      return;
    }
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      problemJson(res, 400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    const data = parsed.data;
    const update: Record<string, unknown> = { ...data };
    if (data.expiresAt) update['expiresAt'] = new Date(data.expiresAt);

    const item = await InventoryItem.findOneAndUpdate(
      { _id: req.params['id'], userId: req.userId },
      update,
      { new: true, runValidators: true },
    );
    if (!item) {
      problemJson(res, 404, 'Not Found', 'Inventory item not found');
      return;
    }
    invalidateUser(req.userId);
    res.json(item);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/inventory/:id
inventoryRouter.delete('/:id', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params['id'])) {
      problemJson(res, 400, 'Invalid ID', 'ID is not a valid ObjectId');
      return;
    }
    const item = await InventoryItem.findOneAndDelete({ _id: req.params['id'], userId: req.userId });
    if (!item) {
      problemJson(res, 404, 'Not Found', 'Inventory item not found');
      return;
    }
    invalidateUser(req.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
