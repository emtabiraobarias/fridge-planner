import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

// Inventory-grounded meal consumption (spec 006): plan → cook (adjust an amount)
// → inventory reflects → un-cook restores — against a real build + in-memory Mongo.
// The recommendations response is mocked at the network edge with a grounded meal
// referencing the REAL seeded inventory item (no Holodeck agent in E2E); the server
// still executes the whole cook/un-cook lifecycle for real.
test.describe.configure({ mode: 'serial' });

async function seededItemId(page: Page): Promise<string> {
  const res = await page.request.get('/api/v1/inventory');
  const data = (await res.json()) as { items: Array<{ _id: string; name: string }> };
  const item = data.items.find((i) => i.name.toLowerCase().includes('chicken'));
  if (!item) throw new Error('seeded chicken item not found');
  return item._id;
}

test('plan is inventory-neutral; cook deducts the adjusted amount; un-cook restores (FR-MC-006..015)', async ({
  page,
}) => {
  // Seed 1000 g of chicken thighs through the real quick-add.
  await page.goto('/');
  const input = page.getByLabel('Quick add item');
  await input.fill('1000 grams chicken thighs');
  await input.press('Enter');
  await expect(page.getByText('Chicken Thighs', { exact: true })).toBeVisible();
  await expect(page.getByText('1000 g', { exact: true })).toBeVisible();

  const itemId = await seededItemId(page);

  // Mock the agent round: one grounded meal using 500 g of the real item.
  await page.route('**/api/v1/recommendations', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        fallback: 'popular', // skips the FR-037 lazy link phase in the client
        recommendations: [
          {
            mealName: 'E2E Chicken Adobo',
            suggestedMealType: 'dinner',
            prepTimeMinutes: 25,
            cuisine: 'Filipino',
            description: 'Grounded test meal.',
            usesIngredients: ['Chicken Thighs'],
            expiringIngredients: [],
            missingIngredients: ['Soy Sauce'],
            groundedIngredients: [
              {
                inventoryItemId: itemId,
                name: 'Chicken Thighs',
                quantityToConsume: 500,
                unit: 'g',
                resolution: 'direct',
              },
            ],
            recipeUrl: 'https://example.com/adobo',
          },
        ],
      }),
    });
  });

  // Plan it via tap-to-place.
  await page.goto('/calendar');
  await page.getByRole('button', { name: /get suggestions/i }).click();
  const place = page.getByRole('button', { name: /place on calendar/i }).first();
  await expect(place).toBeVisible({ timeout: 30_000 });
  await place.click();
  await page.getByRole('button', { name: /place here/i }).first().click();
  await expect(page.getByText('E2E Chicken Adobo').first()).toBeVisible();

  // Planning never touches inventory (FR-MC-006).
  await page.goto('/');
  await expect(page.getByText('1000 g', { exact: true })).toBeVisible();

  // Cook: open the entry, review pre-fills 500 g, adjust to 300, confirm.
  await page.goto('/calendar');
  await page.getByText('E2E Chicken Adobo').first().click();
  await page.getByRole('button', { name: /mark cooked/i }).click();
  const amount = page.getByLabel('Chicken Thighs amount');
  await expect(amount).toHaveValue('500');
  await amount.fill('300');
  await page.screenshot({ path: `${SHOTS}/11-consumption-review.png` });
  await page.getByRole('button', { name: /^confirm$/i }).click();

  // Cooked badge on the tile; kitchen reflects the confirmed deduction.
  await expect(page.getByText('Cooked', { exact: true }).first()).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/12-cooked-tile.png`, fullPage: true });
  await page.goto('/');
  await expect(page.getByText('700 g', { exact: true })).toBeVisible();

  // Un-cook restores exactly (FR-MC-013): receipt shown, then back to 1000 g.
  await page.goto('/calendar');
  await page.getByText('E2E Chicken Adobo').first().click();
  await expect(page.getByText(/consumed when cooked/i)).toBeVisible();
  await expect(page.getByText(/Chicken Thighs — 300 g/)).toBeVisible();
  await page.getByRole('button', { name: /un-cook/i }).click();
  await page.goto('/');
  await expect(page.getByText('1000 g', { exact: true })).toBeVisible();
});
