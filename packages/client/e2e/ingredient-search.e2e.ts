import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

test.describe.configure({ mode: 'serial' });

interface InventoryItem {
  _id: string;
  name: string;
  quantity: number;
  unit: string;
}

interface InventoryResponse {
  items: InventoryItem[];
}

interface RecommendationRequestBody {
  ingredientItemIds?: string[];
}

interface RecommendationsResponse {
  fallback: 'popular';
  recommendations: Array<{
    mealName: string;
    suggestedMealType: 'breakfast' | 'lunch' | 'dinner';
    prepTimeMinutes: number;
    cuisine: string;
    description: string;
    usesIngredients: string[];
    expiringIngredients: string[];
    missingIngredients: string[];
    groundedIngredients: Array<{
      inventoryItemId: string;
      name: string;
      quantityToConsume: number;
      unit: string;
      resolution: 'direct';
    }>;
    recipeUrl: string;
  }>;
}

function uniqueName(label: string): string {
  return `E2E ${label} ${randomUUID().slice(0, 8)}`;
}

function parseRecommendationBody(raw: string | null): RecommendationRequestBody {
  if (!raw) return {};
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== 'object' || parsed === null) return {};
  const body = parsed as { ingredientItemIds?: unknown };
  return Array.isArray(body.ingredientItemIds) &&
    body.ingredientItemIds.every((id) => typeof id === 'string')
    ? { ingredientItemIds: body.ingredientItemIds }
    : {};
}

function mockRecommendations(mealName: string, ingredientIds: string[]): RecommendationsResponse {
  return {
    fallback: 'popular',
    recommendations: [
      {
        mealName,
        suggestedMealType: 'dinner',
        prepTimeMinutes: 20,
        cuisine: 'E2E',
        description: 'Deterministic recommendation for scoped ingredient coverage.',
        usesIngredients: ['selected ingredients'],
        expiringIngredients: ['selected ingredients'],
        missingIngredients: [],
        groundedIngredients: ingredientIds.map((inventoryItemId) => ({
          inventoryItemId,
          name: 'selected ingredient',
          quantityToConsume: 1,
          unit: 'count',
          resolution: 'direct',
        })),
        recipeUrl: 'https://example.com/e2e-recipe',
      },
    ],
  };
}

async function createInventoryItem(
  request: APIRequestContext,
  item: { name: string; quantity: number; unit: string; category: string; location: string },
): Promise<InventoryItem> {
  const res = await request.post('/api/v1/inventory', { data: item });
  expect(res.status()).toBe(201);
  return (await res.json()) as InventoryItem;
}

async function inventoryItems(page: Page): Promise<InventoryItem[]> {
  const res = await page.request.get('/api/v1/inventory');
  expect(res.status()).toBe(200);
  return ((await res.json()) as InventoryResponse).items;
}

async function expectInventoryQuantity(page: Page, name: string, quantity: number): Promise<void> {
  await expect
    .poll(async () => {
      const matches = (await inventoryItems(page)).filter((item) => item.name === name);
      return matches.length === 1 ? matches[0]!.quantity : null;
    })
    .toBe(quantity);
}

async function seedScopedIngredients(page: Page): Promise<InventoryItem[]> {
  const basil = await createInventoryItem(page.request, {
    name: uniqueName('Scope Basil'),
    quantity: 1,
    unit: 'bunch',
    category: 'Produce',
    location: 'fridge',
  });
  const tofu = await createInventoryItem(page.request, {
    name: uniqueName('Scope Tofu'),
    quantity: 400,
    unit: 'g',
    category: 'Other',
    location: 'fridge',
  });
  return [basil, tofu];
}

test('Kitchen: recommendations wait for the manual CTA before loading (FR-IR-001/002)', async ({
  page,
}) => {
  const [item] = await seedScopedIngredients(page);
  let requests = 0;

  await page.route('**/api/v1/recommendations', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue();
      return;
    }
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockRecommendations('Manual CTA Pasta', [item!._id])),
    });
  });

  await page.goto('/');
  await expect(page.getByText(/Ready when you are/i)).toBeVisible();
  expect(requests).toBe(0);

  await page.getByRole('button', { name: 'Get Recommendations' }).click();
  await expect(page.getByText('Manual CTA Pasta')).toBeVisible();
  expect(requests).toBe(1);
});

test('Kitchen: selected ingredients scope the recommendation request (FR-IR-005..008)', async ({
  page,
}) => {
  const items = await seedScopedIngredients(page);
  const capturedBodies: RecommendationRequestBody[] = [];

  await page.route('**/api/v1/recommendations', async (route) => {
    capturedBodies.push(parseRecommendationBody(route.request().postData()));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockRecommendations(
          'Selected Ingredient Stir Fry',
          items.map((item) => item._id),
        ),
      ),
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Select items for recipe search' }).click();
  await page.getByRole('checkbox', { name: `Select ${items[0]!.name}` }).check();
  await page.getByRole('checkbox', { name: `Select ${items[1]!.name}` }).check();
  await page.screenshot({ path: `${SHOTS}/08-ingredient-search-selected.png` });

  await page.getByRole('button', { name: 'Find recipes with selected' }).click();
  await expect(page.getByText('Selected Ingredient Stir Fry')).toBeVisible();

  expect(capturedBodies).toHaveLength(1);
  expect([...(capturedBodies[0]!.ingredientItemIds ?? [])].sort()).toEqual(
    items.map((item) => item._id).sort(),
  );
});

test('Calendar: ingredient chips use the same scoped recommendation request (FR-IR-006)', async ({
  page,
}) => {
  const items = await seedScopedIngredients(page);
  const capturedBodies: RecommendationRequestBody[] = [];

  await page.route('**/api/v1/recommendations', async (route) => {
    capturedBodies.push(parseRecommendationBody(route.request().postData()));
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(
        mockRecommendations(
          'Calendar Chip Curry',
          items.map((item) => item._id),
        ),
      ),
    });
  });

  await page.goto('/calendar');
  await page.getByRole('button', { name: `Filter by ${items[0]!.name}` }).click();
  await page.getByRole('button', { name: `Filter by ${items[1]!.name}` }).click();
  await page.getByRole('button', { name: 'Get suggestions' }).click();
  await expect(page.getByText('Calendar Chip Curry')).toBeVisible();

  expect(capturedBodies).toHaveLength(1);
  expect([...(capturedBodies[0]!.ingredientItemIds ?? [])].sort()).toEqual(
    items.map((item) => item._id).sort(),
  );
});

test('Kitchen: quick-add merges duplicates and Undo reverses the merge delta (FR-IR-012/013)', async ({
  page,
}) => {
  const name = uniqueName('Merge Milk');
  await createInventoryItem(page.request, {
    name,
    quantity: 1,
    unit: 'L',
    category: 'Dairy',
    location: 'fridge',
  });

  await page.goto('/');
  const input = page.getByLabel('Quick add item');
  await input.fill(`500 ml ${name.toLowerCase()}`);
  await input.press('Enter');

  await expect(page.getByText(`${name} merged into your existing item`)).toBeVisible();
  await expectInventoryQuantity(page, name, 1.5);

  await page.getByRole('button', { name: 'Undo' }).click();
  await expectInventoryQuantity(page, name, 1);
});
