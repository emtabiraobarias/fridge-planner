import type { MealRecommendation } from '../types/meal-recommendation';
import { ensureOk, apiFetch } from './http';
export type { MealRecommendation };
export type ExpirationStatus = 'expired' | 'expiring-soon' | 'normal' | 'none';
export type Category = 'Produce' | 'Dairy' | 'Meat' | 'Seafood' | 'Grains' | 'Pantry' | 'Condiments' | 'Frozen' | 'Other';
export type Location = 'fridge' | 'freezer' | 'pantry';

export interface InventoryItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  location: Location;
  expiresAt?: string;
  expirationStatus: ExpirationStatus;
}

export interface InventorySummary {
  total: number;
  expired: number;
  expiringSoon: number;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export interface InventoryResponse {
  items: InventoryItem[];
  summary: InventorySummary;
  pagination: Pagination;
}

const BASE = '/api/v1';

export async function fetchInventory(params?: { category?: string; status?: string; page?: number; limit?: number }): Promise<InventoryResponse> {
  const query = new URLSearchParams();
  if (params?.category) query.set('category', params.category);
  if (params?.status) query.set('status', params.status);
  if (params?.page) query.set('page', String(params.page));
  if (params?.limit) query.set('limit', String(params.limit));
  const res = await apiFetch(`${BASE}/inventory?${query}`);
  ensureOk(res, "fetch inventory");
  return res.json() as Promise<InventoryResponse>;
}

/**
 * `mergeDuplicates` (spec 009 EC-03, research D6) is opt-in and quick-add-only —
 * default/absent create behaves byte-identically to today. Server-side Zod +
 * branch logic land in IR3 (T032).
 */
export type CreateItemPayload = Omit<InventoryItem, '_id' | 'expirationStatus'> & {
  mergeDuplicates?: boolean;
};

/**
 * `merged:true` (spec 009 US3, FR-IR-012) reflects the server's opt-in
 * `mergeDuplicates` merge: no new row was created — `item` is the merged target,
 * `addedQuantity` (in `item.unit`) is what Undo (FR-IR-013) needs to reverse.
 */
export type CreateItemResult =
  | { merged: false; item: InventoryItem }
  | { merged: true; item: InventoryItem; mergedItemId: string; addedQuantity: number };

export async function createItem(data: CreateItemPayload): Promise<CreateItemResult> {
  const res = await apiFetch(`${BASE}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  ensureOk(res, "create item");
  const json = (await res.json()) as
    | (InventoryItem & { merged?: undefined })
    | { merged: true; item: InventoryItem; mergedItemId: string; addedQuantity: number };
  if (json.merged === true) return json;
  return { merged: false, item: json };
}

/** Updatable fields — expiresAt accepts null to CLEAR the expiry (FR-UI-019 revised). */
export type InventoryItemUpdate = Partial<Omit<InventoryItem, '_id' | 'expirationStatus' | 'expiresAt'>> & {
  expiresAt?: string | null;
};

export async function updateItem(id: string, data: InventoryItemUpdate): Promise<InventoryItem> {
  const res = await apiFetch(`${BASE}/inventory/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  ensureOk(res, "update item");
  return res.json() as Promise<InventoryItem>;
}

export async function deleteItem(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/inventory/${id}`, { method: 'DELETE' });
  ensureOk(res, "delete item");
}

/** `fallback` is set by the server when these aren't personalised AI results: */
export type RecommendationsResult = {
  recommendations: MealRecommendation[];
  fallback?: 'popular' | 'cache';
};

export interface RecipeLinksResult {
  links: Record<string, { recipeUrl: string; imageUrl?: string }>;
  /** false → verification cannot run at all (no provider keys) — FR-037 notice case. */
  available: boolean;
}

/** FR-037 lazy phase: verify recipe links for already-displayed meals. */
export async function fetchRecipeLinks(mealNames: string[]): Promise<RecipeLinksResult> {
  const res = await apiFetch(`${BASE}/recommendations/verify-links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mealNames }),
  });
  ensureOk(res, 'verify recipe links');
  return (await res.json()) as RecipeLinksResult;
}

/**
 * User-facing message for a failed recommendations fetch: prefers the server's
 * Problem JSON detail (thrown by fetchRecommendations below) over the caller's
 * generic fallback text.
 */
export function recommendationsErrorMessage(err: unknown, generic: string): string {
  const detail =
    err instanceof Error && err.message && !err.message.startsWith('Failed to') ? err.message : '';
  return detail || generic;
}

/**
 * `ingredientItemIds` (spec 009, research D3) scopes generation to a selection of
 * inventory `_id`s — sent ONLY when non-empty, so an empty/absent selection is a
 * whole-inventory request byte-identical to today (FR-IR-004/007).
 */
export async function fetchRecommendations(ingredientItemIds?: string[]): Promise<RecommendationsResult> {
  const res = await apiFetch(`${BASE}/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ingredientItemIds && ingredientItemIds.length > 0 ? { ingredientItemIds } : {}),
  });
  // Surface the server's Problem JSON `detail` (e.g. FR-037's 503 "recipe verification
  // unavailable") so the UI can explain the failure instead of a generic message.
  // 401 still goes through ensureOk's auth flow below.
  if (!res.ok && res.status !== 401) {
    let detail = '';
    try {
      detail = ((await res.json()) as { detail?: string }).detail ?? '';
    } catch {
      // non-JSON error body — fall through to the generic message
    }
    throw new Error(detail || `Failed to fetch recommendations: ${res.status}`);
  }
  ensureOk(res, "fetch recommendations");
  const data = await res.json() as RecommendationsResult;
  return { recommendations: data.recommendations, ...(data.fallback ? { fallback: data.fallback } : {}) };
}
