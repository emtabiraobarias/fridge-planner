import { Router } from 'express';
import mongoose from 'mongoose';
import { z } from 'zod';
import { InventoryItem, CATEGORIES, LOCATIONS } from '../../models/inventory-item.js';
import { problemJson } from '../../lib/errors.js';

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
    const filter: Record<string, unknown> = {};
    if (category) filter['category'] = category;
    if (status) filter['expirationStatus'] = status;

    const items = await InventoryItem.find(filter).sort({ expiresAt: 1, name: 1 });

    const total = items.length;
    const expired = items.filter((i) => i.expirationStatus === 'expired').length;
    const expiringSoon = items.filter((i) => i.expirationStatus === 'expiring-soon').length;

    res.json({ items, summary: { total, expired, expiringSoon } });
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
      userId: 'anonymous', // replaced with auth userId in CR-001 implementation
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : undefined,
    });
    await item.save();
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

    const item = await InventoryItem.findByIdAndUpdate(
      req.params['id'],
      update,
      { new: true, runValidators: true },
    );
    if (!item) {
      problemJson(res, 404, 'Not Found', 'Inventory item not found');
      return;
    }
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
    const item = await InventoryItem.findByIdAndDelete(req.params['id']);
    if (!item) {
      problemJson(res, 404, 'Not Found', 'Inventory item not found');
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
