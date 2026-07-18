import 'server-only';
import { z } from 'zod';
import { MealPlan } from '../models/meal-plan';
import { consumeConfirmed } from '../lib/ingredient-consumption';
import { invalidateUser } from '../services/recommendations-cache';
import { MEAL_TYPES } from '../types/meal-plan';
import { problem, type ControllerResult } from '../http';

const mealRecommendationSchema = z.object({
  mealName: z.string().min(1),
  suggestedMealType: z.enum(['breakfast', 'lunch', 'dinner']),
  prepTimeMinutes: z.number().nonnegative(),
  cuisine: z.string(),
  description: z.string(),
  // Legacy string[] and grounded object[] snapshots both occur (spec 006 D1) — the
  // meal is an opaque snapshot here; consumption re-validates at cook time.
  usesIngredients: z.array(z.unknown()),
  expiringIngredients: z.array(z.string()),
  missingIngredients: z.array(z.string()),
  groundedIngredients: z.array(z.unknown()).optional(),
  recipeUrl: z.string().url().optional(),
});

// NOTE: zod strips unknown keys — client-sent lifecycle fields (status/cookedAt/
// consumedItems) never survive parsing; the server owns them (FR-MC-006/007).
const entrySchema = z.object({
  slotId: z.string().uuid(),
  date: z.string().datetime({ offset: true }),
  mealType: z.enum(MEAL_TYPES as unknown as [string, ...string[]]),
  meal: mealRecommendationSchema,
});

const consumptionLineSchema = z.object({
  inventoryItemId: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(100),
  quantity: z.number().finite().min(0).max(1_000_000),
  unit: z.string().min(1).max(20).optional(),
});

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('cook'), consumption: z.array(consumptionLineSchema).max(20) }),
  z.object({ action: z.literal('uncook') }),
]);

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

// POST /api/v1/meal-plans/:weekStart/entries — planning never touches inventory (FR-MC-006).
export async function addMealEntry(
  userId: string,
  weekStartParam: string,
  body: unknown,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;

  const parsed = entrySchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const entry = { ...parsed.data, date: new Date(parsed.data.date), status: 'planned' as const };
  const plan = await MealPlan.findOneAndUpdate(
    { userId, weekStart: parsedWeek.weekStart },
    { $push: { entries: entry } },
    { upsert: true, new: true },
  );

  return { status: 201, body: { plan } };
}

// DELETE /api/v1/meal-plans/:weekStart/entries/:slotId — pure removal for both
// planned and cooked entries (FR-MC-006/014): a cooked meal was eaten; deleting
// its record does not refill the fridge.
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

  const plan = await MealPlan.findOneAndUpdate(
    { userId, weekStart },
    { $pull: { entries: { slotId } } },
    { new: true },
  );

  return { status: 200, body: { plan } };
}

// PUT /api/v1/meal-plans/:weekStart — inventory-neutral replace. Lifecycle fields
// are preserved from the STORED plan per surviving slotId; client-sent values are
// stripped by the schema (a client cannot cook, un-cook, or forge receipts via PUT).
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

  const before = await MealPlan.findOne({ userId, weekStart });
  const lifecycleBySlot = new Map(
    (before?.entries ?? []).map((e) => [
      e.slotId,
      { status: e.status, cookedAt: e.cookedAt, consumedItems: e.consumedItems },
    ]),
  );

  const entries = parsed.data.entries.map((e) => {
    const kept = lifecycleBySlot.get(e.slotId);
    return {
      ...e,
      date: new Date(e.date),
      status: kept?.status ?? ('planned' as const),
      ...(kept?.cookedAt ? { cookedAt: kept.cookedAt } : {}),
      ...(kept?.consumedItems ? { consumedItems: kept.consumedItems } : {}),
    };
  });

  const plan = await MealPlan.findOneAndUpdate(
    { userId, weekStart },
    { $set: { entries } },
    { upsert: true, new: true },
  );

  return { status: 200, body: { plan } };
}

// PATCH /api/v1/meal-plans/:weekStart/entries/:slotId — the spec 006 lifecycle
// transition (cook / un-cook).
export async function patchMealEntry(
  userId: string,
  weekStartParam: string,
  slotId: string,
  body: unknown,
): Promise<ControllerResult> {
  const parsedWeek = parseWeekStart(weekStartParam);
  if ('error' in parsedWeek) return parsedWeek.error;
  const { weekStart } = parsedWeek;

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return invalidInput(parsed.error);

  const existing = await MealPlan.findOne({ userId, weekStart, 'entries.slotId': slotId });
  if (!existing) return problem(404, 'Not Found', `No entry with slotId "${slotId}" found`);

  return parsed.data.action === 'cook'
    ? cookEntry(userId, weekStart, slotId, parsed.data.consumption)
    : problem(409, 'Conflict', 'Un-cook is not supported until spec 006 US3');
}

async function cookEntry(
  userId: string,
  weekStart: Date,
  slotId: string,
  consumption: z.infer<typeof consumptionLineSchema>[],
): Promise<ControllerResult> {
  // Atomic idempotency guard (research D6): only a planned entry transitions; a
  // retry / concurrent double-tap matches nothing → 409, zero deduction (SC-MC-003).
  // Legacy entries have NO status field, so they never match 'planned' (FR-MC-011).
  const transitioned = await MealPlan.findOneAndUpdate(
    { userId, weekStart, entries: { $elemMatch: { slotId, status: 'planned' } } },
    { $set: { 'entries.$[e].status': 'cooked', 'entries.$[e].cookedAt': new Date() } },
    { arrayFilters: [{ 'e.slotId': slotId, 'e.status': 'planned' }], new: true },
  );
  if (!transitioned) {
    return problem(409, 'Conflict', 'Entry is already cooked');
  }

  const receipt = await consumeConfirmed(userId, consumption);

  const plan = await MealPlan.findOneAndUpdate(
    { userId, weekStart },
    { $set: { 'entries.$[e].consumedItems': receipt } },
    { arrayFilters: [{ 'e.slotId': slotId }], new: true },
  );

  invalidateUser(userId); // consumption changed inventory → suggestions must reflect it (FR-MC-010)
  return { status: 200, body: { plan, receipt } };
}
