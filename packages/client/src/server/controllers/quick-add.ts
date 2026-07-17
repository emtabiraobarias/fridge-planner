import 'server-only';
import { z } from 'zod';
import { IngredientAlias, type IIngredientAlias } from '../models/ingredient-alias';
import { CATEGORIES, LOCATIONS } from '../models/inventory-item';
import { problem, type ControllerResult } from '../http';

/** Canonical display units the quick-add parser emits (spec 005 FR-IQ-002). */
const CANONICAL_UNITS = [
  'count',
  'g',
  'kg',
  'ml',
  'L',
  'pcs',
  'pack',
  'bag',
  'can',
  'bottle',
  'dozen',
  'bunch',
  'jar',
  'loaf',
] as const;

const patchSchema = z
  .object({
    category: z.enum(CATEGORIES as unknown as [string, ...string[]]).optional(),
    location: z.enum(LOCATIONS as unknown as [string, ...string[]]).optional(),
    unit: z.enum(CANONICAL_UNITS).optional(),
    observedShelfLifeDays: z.number().int().min(0).max(365).optional(),
  })
  .refine((body) => Object.keys(body).length > 0, { message: 'At least one field is required' });

const MAX_OBSERVATIONS = 5;

function normaliseNameKey(raw: string): string {
  return raw.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Median of the observation window; only meaningful at ≥2 observations (FR-IQ-017). */
function suggestedShelfLifeDays(observations: number[]): number | undefined {
  if (observations.length < 2) return undefined;
  const sorted = [...observations].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

interface AliasView {
  nameKey: string;
  category?: string;
  location?: string;
  unit?: string;
  suggestedShelfLifeDays?: number;
}

function toView(alias: IIngredientAlias): AliasView {
  const suggestion = suggestedShelfLifeDays(alias.expiryObservations);
  return {
    nameKey: alias.nameKey,
    ...(alias.category ? { category: alias.category } : {}),
    ...(alias.location ? { location: alias.location } : {}),
    ...(alias.unit ? { unit: alias.unit } : {}),
    ...(suggestion !== undefined ? { suggestedShelfLifeDays: suggestion } : {}),
  };
}

// GET /api/v1/quick-add/aliases
export async function listAliases(userId: string): Promise<ControllerResult> {
  const docs = await IngredientAlias.find({ userId }).sort({ nameKey: 1 });
  return { status: 200, body: { aliases: docs.map((d) => toView(d.toObject())) } };
}

// PUT /api/v1/quick-add/aliases/:nameKey
export async function upsertAlias(
  userId: string,
  rawNameKey: string,
  body: unknown,
): Promise<ControllerResult> {
  const nameKey = normaliseNameKey(rawNameKey);
  if (!nameKey || nameKey.length > 100) {
    return problem(400, 'Invalid input', 'nameKey must be 1-100 characters');
  }
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return problem(400, 'Invalid input', parsed.error.issues.map((i) => i.message).join('; '));
  }

  const { category, location, unit, observedShelfLifeDays } = parsed.data;
  const set: Record<string, string> = {};
  if (category) set['category'] = category;
  if (location) set['location'] = location;
  if (unit) set['unit'] = unit;

  const update: Record<string, unknown> = { $set: set };
  if (observedShelfLifeDays !== undefined) {
    update['$push'] = {
      expiryObservations: { $each: [observedShelfLifeDays], $slice: -MAX_OBSERVATIONS },
    };
  }

  const doc = await IngredientAlias.findOneAndUpdate({ userId, nameKey }, update, {
    upsert: true,
    new: true,
    setDefaultsOnInsert: true,
  });
  return { status: 200, body: { alias: toView(doc!.toObject()) } };
}
