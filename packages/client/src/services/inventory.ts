import type { MealRecommendation } from '../types/meal-recommendation';
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
  const res = await fetch(`${BASE}/inventory?${query}`);
  if (!res.ok) throw new Error(`Failed to fetch inventory: ${res.status}`);
  return res.json() as Promise<InventoryResponse>;
}

export async function createItem(data: Omit<InventoryItem, '_id' | 'expirationStatus'>): Promise<InventoryItem> {
  const res = await fetch(`${BASE}/inventory`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to create item: ${res.status}`);
  return res.json() as Promise<InventoryItem>;
}

export async function updateItem(id: string, data: Partial<Omit<InventoryItem, '_id' | 'expirationStatus'>>): Promise<InventoryItem> {
  const res = await fetch(`${BASE}/inventory/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error(`Failed to update item: ${res.status}`);
  return res.json() as Promise<InventoryItem>;
}

export async function deleteItem(id: string): Promise<void> {
  const res = await fetch(`${BASE}/inventory/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete item: ${res.status}`);
}

export async function fetchRecommendations(): Promise<MealRecommendation[]> {
  const res = await fetch(`${BASE}/recommendations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error(`Failed to fetch recommendations: ${res.status}`);
  const data = await res.json() as { recommendations: MealRecommendation[] };
  return data.recommendations;
}
