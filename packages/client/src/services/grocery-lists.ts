import type {
  GroceryList,
  AddGroceryItemPayload,
  PatchGroceryItemPayload,
  CompleteItemPayload,
  CompleteResult,
} from '../types/grocery-list';

const BASE = '/api/v1/grocery-lists';

export async function fetchGroceryList(weekStart: string): Promise<GroceryList | null> {
  const res = await fetch(`${BASE}/${weekStart}`);
  if (!res.ok) throw new Error(`Failed to fetch grocery list: ${res.status}`);
  const data = (await res.json()) as { groceryList: GroceryList | null };
  return data.groceryList;
}

export async function generateGroceryList(weekStart: string): Promise<GroceryList> {
  const res = await fetch(`${BASE}/${weekStart}/generate`, { method: 'POST' });
  if (!res.ok) throw new Error(`Failed to generate grocery list: ${res.status}`);
  const data = (await res.json()) as { groceryList: GroceryList };
  return data.groceryList;
}

export async function addGroceryItem(
  weekStart: string,
  payload: AddGroceryItemPayload,
): Promise<GroceryList> {
  const res = await fetch(`${BASE}/${weekStart}/items`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to add grocery item: ${res.status}`);
  const data = (await res.json()) as { groceryList: GroceryList };
  return data.groceryList;
}

export async function patchGroceryItem(
  weekStart: string,
  itemId: string,
  payload: PatchGroceryItemPayload,
): Promise<GroceryList> {
  const res = await fetch(`${BASE}/${weekStart}/items/${itemId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to update grocery item: ${res.status}`);
  const data = (await res.json()) as { groceryList: GroceryList };
  return data.groceryList;
}

export async function deleteGroceryItem(weekStart: string, itemId: string): Promise<GroceryList> {
  const res = await fetch(`${BASE}/${weekStart}/items/${itemId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Failed to delete grocery item: ${res.status}`);
  const data = (await res.json()) as { groceryList: GroceryList };
  return data.groceryList;
}

export async function completeGroceryList(
  weekStart: string,
  items: CompleteItemPayload[],
): Promise<CompleteResult> {
  const res = await fetch(`${BASE}/${weekStart}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items }),
  });
  if (!res.ok) throw new Error(`Failed to complete grocery list: ${res.status}`);
  return (await res.json()) as CompleteResult;
}
