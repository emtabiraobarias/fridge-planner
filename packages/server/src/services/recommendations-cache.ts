import type { MealRecommendation } from '../types/meal-recommendation.js';

const TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  result: MealRecommendation[];
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function buildCacheKey(
  userId: string,
  ingredients: Array<{ name: string; quantity: number; unit: string; expiresAt?: string }>,
): string {
  const sortedIngredients = ingredients
    .map((i) => `${i.name}|${i.quantity}|${i.unit}|${i.expiresAt ?? ''}`)
    .sort()
    .join(';');
  return `${userId}::${sortedIngredients}`;
}

export function getCached(key: string): MealRecommendation[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  // Past TTL the entry is no longer "fresh", but we keep it so getStale() can serve it
  // as a last-known-good fallback when the agent is unavailable (EC-08). It is cleared on
  // any inventory mutation via invalidateUser(), so it never outlives the inventory it described.
  if (Date.now() - entry.cachedAt > TTL_MS) return null;
  return entry.result;
}

/** Last-known-good result for a key, ignoring TTL. Used as an agent-failure fallback (EC-08). */
export function getStale(key: string): MealRecommendation[] | null {
  return cache.get(key)?.result ?? null;
}

export function setCached(key: string, result: MealRecommendation[]): void {
  cache.set(key, { result, cachedAt: Date.now() });
}

export function invalidateUser(userId: string): void {
  const prefix = `${userId}::`;
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) cache.delete(key);
  }
}
