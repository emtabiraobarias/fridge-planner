import type {
  GroceryList,
  AddGroceryItemPayload,
  PatchGroceryItemPayload,
  ResolvedPurchaseInput,
  CompleteItemPayload,
  CompleteResult,
} from '../types/grocery-list';
import { ensureOk, apiFetch } from './http';

const BASE = '/api/v1/grocery-lists';

export async function fetchGroceryList(weekStart: string): Promise<GroceryList | null> {
  const res = await apiFetch(`${BASE}/${weekStart}`);
  ensureOk(res, "fetch grocery list");
  const data = (await res.json()) as { groceryList: GroceryList | null };
  return data.groceryList;
}

export async function generateGroceryList(weekStart: string): Promise<GroceryList> {
  const res = await apiFetch(`${BASE}/${weekStart}/generate`, { method: 'POST' });
  ensureOk(res, "generate grocery list");
  const data = (await res.json()) as { groceryList: GroceryList };
  return data.groceryList;
}

export async function addGroceryItem(
  weekStart: string,
  payload: AddGroceryItemPayload,
): Promise<GroceryList> {
  const res = await apiFetch(`${BASE}/${weekStart}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  ensureOk(res, "add grocery item");
  const data = (await res.json()) as { groceryList: GroceryList };
  return data.groceryList;
}

export async function patchGroceryItem(
  weekStart: string,
  itemId: string,
  payload: PatchGroceryItemPayload,
): Promise<GroceryList> {
  const res = await apiFetch(`${BASE}/${weekStart}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  ensureOk(res, "update grocery item");
  const data = (await res.json()) as { groceryList: GroceryList };
  return data.groceryList;
}

export async function checkOffGroceryItem(
  weekStart: string,
  itemId: string,
  resolvedPurchase?: ResolvedPurchaseInput,
): Promise<GroceryList> {
  return patchGroceryItem(weekStart, itemId, {
    isPurchased: true,
    ...(resolvedPurchase ? { resolvedPurchase } : {}),
  });
}

export async function deleteGroceryItem(weekStart: string, itemId: string): Promise<GroceryList> {
  const res = await apiFetch(`${BASE}/${weekStart}/items/${itemId}`, { method: 'DELETE' });
  ensureOk(res, "delete grocery item");
  const data = (await res.json()) as { groceryList: GroceryList };
  return data.groceryList;
}

export async function completeGroceryList(
  weekStart: string,
  items: CompleteItemPayload[] = [],
): Promise<CompleteResult> {
  const res = await apiFetch(`${BASE}/${weekStart}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  ensureOk(res, "complete grocery list");
  return (await res.json()) as CompleteResult;
}
