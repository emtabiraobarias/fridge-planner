import type { MealRecommendation } from '../types/meal-recommendation.js';

const TTL_MS = 15 * 60 * 1000; // 15 minutes

interface CacheEntry {
  result: MealRecommendation[];
  cachedAt: number;
}

const cache = new Map<string, CacheEntry>();

export function buildCacheKey(
  userId: string,
  preferences: string[],
  ingredients: Array<{ name: string; quantity: number; unit: string; expiresAt?: string }>,
): string {
  const sortedPrefs = [...preferences].sort().join(',');
  const sortedIngredients = ingredients
    .map((i) => `${i.name}|${i.quantity}|${i.unit}|${i.expiresAt ?? ''}`)
    .sort()
    .join(';');
  return `${userId}::${sortedPrefs}::${sortedIngredients}`;
}

export function getCached(key: string): MealRecommendation[] | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return entry.result;
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
