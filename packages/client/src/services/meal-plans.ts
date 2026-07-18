import type { ConsumptionReceiptLine, MealPlan, MealPlanEntry } from '../types/meal-plan';
import { ensureOk, apiFetch } from './http';

const BASE = '/api/v1/meal-plans';

export async function fetchMealPlan(weekStart: string): Promise<MealPlan | null> {
  const res = await apiFetch(`${BASE}?weekStart=${weekStart}`);
  ensureOk(res, "fetch meal plan");
  const data = (await res.json()) as { plan: MealPlan | null };
  return data.plan;
}

export async function addEntry(weekStart: string, entry: MealPlanEntry): Promise<MealPlan> {
  const res = await apiFetch(`${BASE}/${weekStart}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  ensureOk(res, "add entry");
  const data = (await res.json()) as { plan: MealPlan };
  return data.plan;
}

export async function removeEntry(weekStart: string, slotId: string): Promise<MealPlan> {
  const res = await apiFetch(
    `${BASE}/${weekStart}/entries/${slotId}`,
    { method: 'DELETE' },
  );
  ensureOk(res, "remove entry");
  const data = (await res.json()) as { plan: MealPlan };
  return data.plan;
}

export async function replaceEntries(
  weekStart: string,
  entries: MealPlanEntry[],
): Promise<MealPlan> {
  const res = await apiFetch(`${BASE}/${weekStart}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  ensureOk(res, "replace entries");
  const data = (await res.json()) as { plan: MealPlan };
  return data.plan;
}

export interface CookMealLine {
  inventoryItemId?: string;
  name: string;
  quantity: number;
  unit?: string;
}

export interface CookMealResult {
  plan: MealPlan;
  receipt: ConsumptionReceiptLine[];
}

export async function cookEntry(
  weekStart: string,
  slotId: string,
  consumption: CookMealLine[],
): Promise<CookMealResult> {
  const res = await apiFetch(`${BASE}/${weekStart}/entries/${slotId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'cook', consumption }),
  });
  ensureOk(res, 'cook meal');
  return (await res.json()) as CookMealResult;
}
