import { Router } from 'express';
import { z } from 'zod';
import { MealPlan } from '../../models/meal-plan.js';
import { consumeIngredients } from '../../lib/ingredient-consumption.js';
import { problemJson } from '../../lib/errors.js';
import { MEAL_TYPES } from '../../types/meal-plan.js';

export const mealPlansRouter = Router();

const mealRecommendationSchema = z.object({
  mealName: z.string().min(1),
  suggestedMealType: z.enum(['breakfast', 'lunch', 'dinner']),
  prepTimeMinutes: z.number().nonnegative(),
  cuisine: z.string(),
  description: z.string(),
  usesIngredients: z.array(z.string()),
  expiringIngredients: z.array(z.string()),
  missingIngredients: z.array(z.string()),
  recipeUrl: z.string().url().optional(),
  imageUrl: z.string().url().optional(),
});

const entrySchema = z.object({
  slotId: z.string().uuid(),
  date: z.string().datetime({ offset: true }),
  mealType: z.enum(MEAL_TYPES as unknown as [string, ...string[]]),
  meal: mealRecommendationSchema,
});

// GET /api/v1/meal-plans?weekStart=<ISO>
mealPlansRouter.get('/', async (req, res, next) => {
  try {
    const weekStartStr = req.query['weekStart'] as string | undefined;
    if (!weekStartStr) {
      problemJson(res, 400, 'Bad Request', 'weekStart query parameter is required');
      return;
    }
    const weekStart = new Date(weekStartStr);
    if (isNaN(weekStart.getTime())) {
      problemJson(res, 400, 'Bad Request', 'weekStart must be a valid ISO date string');
      return;
    }
    const plan = await MealPlan.findOne({ userId: req.userId, weekStart });
    res.json({ plan: plan ?? null });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/meal-plans/:weekStart/entries
mealPlansRouter.post('/:weekStart/entries', async (req, res, next) => {
  try {
    const weekStart = new Date(req.params['weekStart']);
    if (isNaN(weekStart.getTime())) {
      problemJson(res, 400, 'Bad Request', 'weekStart must be a valid ISO date string');
      return;
    }
    const parsed = entrySchema.safeParse(req.body);
    if (!parsed.success) {
      problemJson(res, 400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    const entry = {
      ...parsed.data,
      date: new Date(parsed.data.date),
    };

    const plan = await MealPlan.findOneAndUpdate(
      { userId: req.userId, weekStart },
      { $push: { entries: entry } },
      { upsert: true, new: true },
    );

    // Best-effort ingredient consumption (non-blocking)
    void consumeIngredients(req.userId, parsed.data.meal.usesIngredients);

    res.status(201).json({ plan });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/v1/meal-plans/:weekStart/entries/:slotId
mealPlansRouter.delete('/:weekStart/entries/:slotId', async (req, res, next) => {
  try {
    const weekStart = new Date(req.params['weekStart']);
    if (isNaN(weekStart.getTime())) {
      problemJson(res, 400, 'Bad Request', 'weekStart must be a valid ISO date string');
      return;
    }
    const { slotId } = req.params;

    // Check entry exists
    const existing = await MealPlan.findOne({
      userId: req.userId,
      weekStart,
      'entries.slotId': slotId,
    });
    if (!existing) {
      problemJson(res, 404, 'Not Found', `No entry with slotId "${slotId}" found`);
      return;
    }

    const plan = await MealPlan.findOneAndUpdate(
      { userId: req.userId, weekStart },
      { $pull: { entries: { slotId } } },
      { new: true },
    );

    res.json({ plan });
  } catch (err) {
    next(err);
  }
});

// PUT /api/v1/meal-plans/:weekStart
mealPlansRouter.put('/:weekStart', async (req, res, next) => {
  try {
    const weekStart = new Date(req.params['weekStart']);
    if (isNaN(weekStart.getTime())) {
      problemJson(res, 400, 'Bad Request', 'weekStart must be a valid ISO date string');
      return;
    }
    const parsed = z.object({ entries: z.array(entrySchema) }).safeParse(req.body);
    if (!parsed.success) {
      problemJson(res, 400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
      return;
    }
    const entries = parsed.data.entries.map((e) => ({
      ...e,
      date: new Date(e.date),
    }));

    const plan = await MealPlan.findOneAndUpdate(
      { userId: req.userId, weekStart },
      { $set: { entries } },
      { upsert: true, new: true },
    );

    res.json({ plan });
  } catch (err) {
    next(err);
  }
});
