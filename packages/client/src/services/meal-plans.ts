import type { MealPlan, MealPlanEntry } from '../types/meal-plan';

const BASE = '/api/v1/meal-plans';

export async function fetchMealPlan(weekStart: string): Promise<MealPlan | null> {
  const res = await fetch(`${BASE}?weekStart=${weekStart}`);
  if (!res.ok) throw new Error(`Failed to fetch meal plan: ${res.status}`);
  const data = (await res.json()) as { plan: MealPlan | null };
  return data.plan;
}

export async function addEntry(weekStart: string, entry: MealPlanEntry): Promise<MealPlan> {
  const res = await fetch(`${BASE}/${weekStart}/entries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry),
  });
  if (!res.ok) throw new Error(`Failed to add entry: ${res.status}`);
  const data = (await res.json()) as { plan: MealPlan };
  return data.plan;
}

export async function removeEntry(weekStart: string, slotId: string): Promise<MealPlan> {
  const res = await fetch(
    `${BASE}/${weekStart}/entries/${slotId}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Failed to remove entry: ${res.status}`);
  const data = (await res.json()) as { plan: MealPlan };
  return data.plan;
}

export async function replaceEntries(
  weekStart: string,
  entries: MealPlanEntry[],
): Promise<MealPlan> {
  const res = await fetch(`${BASE}/${weekStart}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ entries }),
  });
  if (!res.ok) throw new Error(`Failed to replace entries: ${res.status}`);
  const data = (await res.json()) as { plan: MealPlan };
  return data.plan;
}
