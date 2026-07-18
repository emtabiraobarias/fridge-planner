import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

test.describe.configure({ mode: 'serial' });

interface GroceryListResponse {
  groceryList: {
    items: Array<{
      _id: string;
      displayName: string;
    }>;
  };
}

interface InventoryResponse {
  items: Array<{
    name: string;
    quantity: number;
    unit: string;
  }>;
}

function currentWeekStart(): string {
  const now = new Date();
  const day = now.getUTCDay();
  const daysToMonday = day === 0 ? 6 : day - 1;
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - daysToMonday)).toISOString();
}

async function addGroceryItem(
  request: APIRequestContext,
  weekStart: string,
  item: { displayName: string; quantity: number; unit: string; category: string },
): Promise<string> {
  const res = await request.post(`/api/v1/grocery-lists/${encodeURIComponent(weekStart)}/items`, { data: item });
  expect(res.status()).toBe(201);
  const data = (await res.json()) as GroceryListResponse;
  const created = data.groceryList.items.find((row) => row.displayName === item.displayName);
  if (!created) throw new Error(`grocery item not found after add: ${item.displayName}`);
  return created._id;
}

async function inventoryItems(page: Page): Promise<InventoryResponse['items']> {
  const res = await page.request.get('/api/v1/inventory');
  expect(res.status()).toBe(200);
  return ((await res.json()) as InventoryResponse).items;
}

async function expectInventoryQuantity(page: Page, name: string, quantity: number): Promise<void> {
  await expect
    .poll(async () => {
      const items = await inventoryItems(page);
      const matches = items.filter((item) => item.name === name);
      return matches.length === 1 ? matches[0]!.quantity : null;
    })
    .toBe(quantity);
}

async function expectInventoryMissing(page: Page, name: string): Promise<void> {
  await expect
    .poll(async () => {
      const items = await inventoryItems(page);
      return items.some((item) => item.name === name);
    })
    .toBe(false);
}

test('Groceries: tick adds, un-tick reverses, checkout skips receipted rows (FR-GC-001/007/011)', async ({
  page,
}) => {
  const weekStart = currentWeekStart();
  const applesId = await addGroceryItem(page.request, weekStart, {
    displayName: 'E2E Checkoff Apples',
    quantity: 2,
    unit: 'count',
    category: 'Produce',
  });

  await page.goto('/grocery');
  await expect(page.getByText('E2E Checkoff Apples', { exact: true })).toBeVisible();
  await page.getByRole('checkbox', { name: /mark e2e checkoff apples as purchased/i }).click();
  await expectInventoryQuantity(page, 'E2E Checkoff Apples', 2);

  await page.goto('/');
  await expect(page.getByRole('listitem', { name: 'E2E Checkoff Apples' })).toBeVisible();

  await page.goto('/grocery');
  await page.getByRole('checkbox', { name: /mark e2e checkoff apples as purchased/i }).click();
  await expectInventoryMissing(page, 'E2E Checkoff Apples');
  await page.goto('/');
  await expect(page.getByRole('listitem', { name: 'E2E Checkoff Apples' })).toHaveCount(0);

  const deleteRes = await page.request.delete(
    `/api/v1/grocery-lists/${encodeURIComponent(weekStart)}/items/${applesId}`,
  );
  expect(deleteRes.status()).toBe(200);

  await addGroceryItem(page.request, weekStart, {
    displayName: 'E2E Checkoff Rice',
    quantity: 1,
    unit: 'bag',
    category: 'Grains',
  });
  await addGroceryItem(page.request, weekStart, {
    displayName: 'E2E Checkoff Pasta',
    quantity: 1,
    unit: 'pack',
    category: 'Grains',
  });

  await page.goto('/grocery');
  await page.getByRole('checkbox', { name: /mark e2e checkoff rice as purchased/i }).click();
  await expectInventoryQuantity(page, 'E2E Checkoff Rice', 1);

  await expect(page.getByRole('button', { name: /done shopping.*move 1 item into my kitchen/i })).toBeVisible();
  await page.getByRole('button', { name: /done shopping.*move 1 item into my kitchen/i }).click();

  await expectInventoryQuantity(page, 'E2E Checkoff Rice', 1);
  await expectInventoryQuantity(page, 'E2E Checkoff Pasta', 1);
});
