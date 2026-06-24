import 'server-only';
import { z } from 'zod';
import { MealPlan } from '../models/meal-plan';
import { consumeIngredients, restoreIngredients } from '../lib/ingredient-consumption';
import { MEAL_TYPES } from '../types/meal-plan';
import { problem, type ControllerResult } from '../http';

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
});

const entrySchema = z.object({
  slotId: z.string().uuid(),
  date: z.string().datetime({ offset: true }),
  mealType: z.enum(MEAL_TYPES as unknown as [string, ...string[]]),
  meal: mealRecommendationSchema,
});

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

// GET /api/v1/meal-plans?weekStart=<ISO>
export async function getMealPlan(userId: string, weekStartStr: string | null): Promise<ControllerResult> {
  if (!weekStartStr) return problem(400, 'Bad Request', 'weekStart query parameter is required');
  const parsed = parseWeekStart(weekStartStr);
  if ('error' in parsed) return parsed.error;

  const plan = await MealPlan.findOne({ userId, weekStart: parsed.weekStart });
  return { status: 200, body: { plan: plan ?? null } };
}

// POST /api/v1/meal-plans/:weekStart/entries
export async function addMealEntry(
  userId: string,
  weekStartParam: string,
  body: unknown,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;

  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const entry = { ...parsed.data, date: new Date(parsed.data.date) };
  const plan = await MealPlan.findOneAndUpdate(
    { userId, weekStart: parsedWeek.weekStart },
    { $push: { entries: entry } },
    { upsert: true, new: true },
  );

  // Consume the meal's ingredients — awaited so the response reflects the new quantities,
  // and reversed on removal/replace (see deleteMealEntry / replaceMealEntries). FR-005, BUG #7.
  await consumeIngredients(userId, parsed.data.meal.usesIngredients);

  return { status: 201, body: { plan } };
}

// DELETE /api/v1/meal-plans/:weekStart/entries/:slotId
export async function deleteMealEntry(
  userId: string,
  weekStartParam: string,
  slotId: string,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;
  const { weekStart } = parsedWeek;

  const existing = await MealPlan.findOne({ userId, weekStart, 'entries.slotId': slotId });
  if (!existing) return problem(404, 'Not Found', `No entry with slotId "${slotId}" found`);

  const removed = existing.entries.find((e) => e.slotId === slotId);
  const plan = await MealPlan.findOneAndUpdate(
    { userId, weekStart },
    { $pull: { entries: { slotId } } },
    { new: true },
  );

  // Restore the removed meal's ingredients to inventory (BUG #7, FR-005).
  if (removed) await restoreIngredients(userId, removed.meal.usesIngredients);

  return { status: 200, body: { plan } };
}

// PUT /api/v1/meal-plans/:weekStart
export async function replaceMealEntries(
  userId: string,
  weekStartParam: string,
  body: unknown,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;
  const { weekStart } = parsedWeek;

  const parsed = z.object({ entries: z.array(entrySchema) }).safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const entries = parsed.data.entries.map((e) => ({ ...e, date: new Date(e.date) }));

  // Net-diff inventory: restore the previous plan's ingredients, then consume the new set,
  // so a replace (e.g. a drag-move) doesn't double-consume (BUG #7, FR-005).
  const before = await MealPlan.findOne({ userId, weekStart });
  const oldUses = (before?.entries ?? []).flatMap((e) => e.meal.usesIngredients);
  const newUses = parsed.data.entries.flatMap((e) => e.meal.usesIngredients);

  const plan = await MealPlan.findOneAndUpdate(
    { userId, weekStart },
    { $set: { entries } },
    { upsert: true, new: true },
  );

  await restoreIngredients(userId, oldUses);
  await consumeIngredients(userId, newUses);

  return { status: 200, body: { plan } };
}
