import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

test.describe.configure({ mode: 'serial' });

interface GroceryListResponse {
  groceryList: {
    items: Array<{
      displayName: string;
      sourceMealNames: string[];
    }>;
  } | null;
}

interface MealEntryInput {
  slotId: string;
  date: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack';
  meal: {
    mealName: string;
    suggestedMealType: 'breakfast' | 'lunch' | 'dinner';
    prepTimeMinutes: number;
    cuisine: string;
    description: string;
    usesIngredients: string[];
    expiringIngredients: string[];
    missingIngredients: string[];
    recipeUrl: string;
  };
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday),
  ).toISOString();
}

function daysFromToday(days: number): string {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + days),
  ).toISOString();
}

function mealEntry(date: string, mealName: string, missingIngredient: string): MealEntryInput {
  return {
    slotId: randomUUID(),
    date,
    mealType: 'dinner',
    meal: {
      mealName,
      suggestedMealType: 'dinner',
      prepTimeMinutes: 25,
      cuisine: 'E2E',
      description: 'Deterministic meal-plan seed for rolling grocery coverage.',
      usesIngredients: [],
      expiringIngredients: [],
      missingIngredients: [missingIngredient],
      recipeUrl: 'https://example.com/e2e-rolling-grocery',
    },
  };
}

async function addMealEntry(
  request: APIRequestContext,
  weekStart: string,
  entry: MealEntryInput,
): Promise<void> {
  const res = await request.post(`/api/v1/meal-plans/${encodeURIComponent(weekStart)}/entries`, {
    data: entry,
  });
  expect(res.status()).toBe(201);
}

async function groceryItems(
  request: APIRequestContext,
  weekStart: string,
): Promise<NonNullable<GroceryListResponse['groceryList']>['items']> {
  const res = await request.get(`/api/v1/grocery-lists/${encodeURIComponent(weekStart)}`);
  expect(res.status()).toBe(200);
  const data = (await res.json()) as GroceryListResponse;
  return data.groceryList?.items ?? [];
}

test('Groceries: rolling recompute includes today-onward meals and drops past needs (FR-RG-001/003/008)', async ({
  page,
}) => {
  const suffix = randomUUID().slice(0, 8).toUpperCase();
  const weekStart = currentWeekStart();
  const pastIngredient = `E2E Past Lentils ${suffix}`;
  const futureIngredient = `E2E Future Noodles ${suffix}`;

  await addMealEntry(
    page.request,
    weekStart,
    mealEntry(daysFromToday(-1), `Past Meal ${suffix}`, pastIngredient),
  );
  await addMealEntry(
    page.request,
    weekStart,
    mealEntry(daysFromToday(1), `Future Meal ${suffix}`, futureIngredient),
  );

  await page.goto('/grocery');
  await expect(page.getByText(futureIngredient, { exact: true })).toBeVisible();
  await expect(page.getByText(pastIngredient, { exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${SHOTS}/09-rolling-grocery.png` });

  const firstItems = await groceryItems(page.request, weekStart);
  const generated = firstItems.find((item) => item.displayName === futureIngredient);
  expect(generated?.sourceMealNames).toEqual([`Future Meal ${suffix}`]);

  const secondFutureIngredient = `E2E Future Tomatoes ${suffix}`;
  await addMealEntry(
    page.request,
    weekStart,
    mealEntry(daysFromToday(2), `Second Future Meal ${suffix}`, secondFutureIngredient),
  );

  await page.reload();
  await expect(page.getByText(secondFutureIngredient, { exact: true })).toBeVisible();
  await expect(page.getByText(pastIngredient, { exact: true })).toHaveCount(0);
});
