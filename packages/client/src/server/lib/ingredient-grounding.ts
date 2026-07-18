import 'server-only';
import { z } from 'zod';
import { normalizeIngredientName } from './ingredient-matcher';
import { normalizeUnit } from './unit-normalizer';
import { lookupPairing } from '../services/alias-pairing';
import type { GroundedIngredient, MealRecommendation } from '../types/meal-recommendation';

/**
 * Spec 006 US1 (FR-MC-001..004): validate the meal-recommender's UNTRUSTED
 * ingredient payload against the user's live inventory and resolve each entry
 * through tiers — direct item id → deterministic name match → learned alias
 * pairing — clamping amounts to owned stock. Unresolved entries stay visible as
 * missing ingredients; nothing here ever drops a meal or throws for bad input.
 */

/** The minimal inventory shape grounding needs (the controller passes live docs). */
export interface GroundableItem {
  _id: unknown;
  name: string;
  quantity: number;
  unit: string;
}

const MAX_INGREDIENTS = 20;

const rawEntrySchema = z.object({
  inventoryItemId: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(100),
  quantityToConsume: z.number().finite().positive().max(1_000_000).optional(),
  unit: z.string().min(1).max(20).optional(),
});

interface RawEntry {
  inventoryItemId?: string | undefined;
  name: string;
  quantityToConsume?: number | undefined;
  unit?: string | undefined;
}

/** Accept strings (legacy agents) and objects; salvage the name field-wise; else drop. */
function sanitizeEntry(value: unknown): RawEntry | null {
  if (typeof value === 'string') {
    const name = value.trim().slice(0, 100);
    return name ? { name } : null;
  }
  if (typeof value !== 'object' || value === null) return null;
  const parsed = rawEntrySchema.safeParse(value);
  if (parsed.success) return parsed.data;
  const name = (value as Record<string, unknown>)['name'];
  if (typeof name === 'string' && name.trim()) return { name: name.trim().slice(0, 100) };
  return null;
}

/**
 * Deterministic name match (tier 2): exact canonical key, else head containment
 * ("chicken breast" ⊃ item "chicken") — never tail containment, which is the
 * alias tier's job ("mince" → "Beef Mince"). Longest item key wins.
 */
function fuzzyMatch(name: string, inventory: GroundableItem[]): GroundableItem | undefined {
  const key = normalizeIngredientName(name);
  if (!key) return undefined;

  let best: { item: GroundableItem; len: number } | undefined;
  for (const item of inventory) {
    const invKey = normalizeIngredientName(item.name);
    if (!invKey) continue;
    const matches =
      invKey === key || key.startsWith(`${invKey} `) || invKey.startsWith(`${key} `);
    if (matches && (!best || invKey.length > best.len)) {
      best = { item, len: invKey.length };
    }
  }
  return best?.item;
}

/** Clamp the requested amount to owned stock; {} = matched but unquantified (FR-MC-002). */
function clampAmount(
  entry: RawEntry,
  item: GroundableItem,
): Pick<GroundedIngredient, 'quantityToConsume' | 'unit'> {
  if (entry.quantityToConsume === undefined) return {};
  const unit = entry.unit ?? item.unit;

  const needed = normalizeUnit(entry.quantityToConsume, unit);
  const owned = normalizeUnit(item.quantity, item.unit);
  if (needed.family === 'unknown' || needed.family !== owned.family) return {};

  if (needed.value <= owned.value) return { quantityToConsume: entry.quantityToConsume, unit };

  const perUnit = normalizeUnit(1, unit).value;
  const clamped = Math.round((owned.value / perUnit) * 100) / 100;
  return clamped > 0 ? { quantityToConsume: clamped, unit } : {};
}

function grounded(
  entry: RawEntry,
  item: GroundableItem,
  resolution: GroundedIngredient['resolution'],
): GroundedIngredient {
  return {
    inventoryItemId: String(item._id),
    name: entry.name,
    resolution,
    ...clampAmount(entry, item),
  };
}

async function resolveEntry(
  userId: string,
  entry: RawEntry,
  inventory: GroundableItem[],
): Promise<GroundedIngredient> {
  // Tier 1: direct id — valid only within the user's own inventory (FR-036).
  if (entry.inventoryItemId) {
    const item = inventory.find((i) => String(i._id) === entry.inventoryItemId);
    if (item) return grounded(entry, item, 'direct');
  }

  // Tier 2: deterministic name match.
  const fuzzy = fuzzyMatch(entry.name, inventory);
  if (fuzzy) return grounded(entry, fuzzy, 'fuzzy');

  // Tier 3: learned pairing (cached, fail-open).
  const pairedName = await lookupPairing(userId, entry.name, inventory.map((i) => i.name));
  if (pairedName) {
    const item =
      fuzzyMatch(pairedName, inventory) ??
      inventory.find((i) => i.name.toLowerCase() === pairedName.toLowerCase());
    if (item) return grounded(entry, item, 'alias');
  }

  return { name: entry.name, resolution: 'unresolved' };
}

async function groundMeal(
  userId: string,
  meal: MealRecommendation,
  inventory: GroundableItem[],
): Promise<MealRecommendation> {
  const raw = Array.isArray(meal.usesIngredients) ? (meal.usesIngredients as unknown[]) : [];

  const seen = new Set<string>();
  const entries: RawEntry[] = [];
  for (const value of raw) {
    const entry = sanitizeEntry(value);
    if (!entry) continue;
    const key = normalizeIngredientName(entry.name) || entry.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
    if (entries.length >= MAX_INGREDIENTS) break;
  }

  const groundedIngredients: GroundedIngredient[] = [];
  for (const entry of entries) {
    groundedIngredients.push(await resolveEntry(userId, entry, inventory));
  }

  const usesIngredients = groundedIngredients
    .filter((g) => g.resolution !== 'unresolved')
    .map((g) => g.name);
  const unresolvedNames = groundedIngredients
    .filter((g) => g.resolution === 'unresolved')
    .map((g) => g.name);
  const missingIngredients = [
    ...new Set([...(meal.missingIngredients ?? []), ...unresolvedNames]),
  ];

  return { ...meal, usesIngredients, missingIngredients, groundedIngredients };
}

/** Ground every meal in an agent response against the user's live inventory. */
export async function groundMeals(
  userId: string,
  meals: MealRecommendation[],
  inventory: GroundableItem[],
): Promise<MealRecommendation[]> {
  const out: MealRecommendation[] = [];
  for (const meal of meals) {
    out.push(await groundMeal(userId, meal, inventory));
  }
  return out;
}
