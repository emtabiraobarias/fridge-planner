import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

// Drives the four redesigned screens end-to-end against a real build + Mongo,
// capturing screenshot proof of each (spec 004 — SC-UI-006). Serial: each test
// builds on the state the previous one left (same "anonymous" dev user).
test.describe.configure({ mode: 'serial' });

test('Kitchen: smart quick-add + use-soon + focus outline', async ({ page }) => {
  await page.goto('/');

  // Bottom tab bar with renamed labels + active Kitchen tab.
  await expect(page.getByRole('link', { name: 'Kitchen' })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('link', { name: 'Groceries' })).toBeVisible();

  const input = page.getByLabel('Quick add item');

  // Live parse preview.
  await input.fill('2L milk expires friday');
  await expect(page.getByText("I'll add:")).toBeVisible();
  await expect(page.getByText('Dairy · fridge')).toBeVisible();
  await input.press('Enter');
  await expect(page.getByText('Milk', { exact: true })).toBeVisible();

  // An urgent item surfaces the use-soon strip.
  await input.fill('spinach exp 1d');
  await input.press('Enter');
  await expect(page.getByText('Spinach', { exact: true })).toBeVisible();
  await expect(page.getByText('Use soon:')).toBeVisible();

  // WCAG: keyboard focus shows the terracotta outline (non-default).
  await input.focus();
  await expect(input).toBeFocused();

  await page.screenshot({ path: `${SHOTS}/01-kitchen.png`, fullPage: true });
});

test('Meal plan: tap-to-place a suggestion onto a slot', async ({ page }) => {
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'This week' })).toBeVisible();

  // Fetch suggestions (popular-recipe fallback — no Holodeck agent in E2E).
  await page.getByRole('button', { name: /get suggestions/i }).click();
  const place = page.getByRole('button', { name: /place on calendar/i }).first();
  await expect(place).toBeVisible({ timeout: 30_000 });
  await place.click();

  // Placement banner + highlighted target slots.
  await expect(page.getByText(/Placing/)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/02-calendar-placing.png`, fullPage: true });

  const slot = page.getByRole('button', { name: /place here/i }).first();
  await expect(slot).toBeEnabled();
  await slot.click();

  // Placed → banner gone, confirmation toast.
  await expect(page.getByText(/Placing/)).toHaveCount(0);
  await expect(page.getByText(/planned for/i)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/03-calendar.png`, fullPage: true });
});

test('Groceries: add, check, and inline checkout', async ({ page }) => {
  await page.goto('/grocery');
  await expect(page.getByRole('heading', { name: 'Grocery list' })).toBeVisible();

  // Manual NL quick-add (parser).
  const add = page.getByLabel('Add grocery item');
  await add.fill('2 lemons');
  await add.press('Enter');
  await expect(page.getByText('Lemons', { exact: true })).toBeVisible();

  // Check it → progress + inline checkout button appear.
  await page.getByRole('checkbox', { name: /mark lemons as purchased/i }).click();
  const checkout = page.getByRole('button', { name: /Done shopping — move .* into my kitchen/i });
  await expect(checkout).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/04-grocery.png`, fullPage: true });

  // Checkout moves it into the kitchen (toast).
  await checkout.click();
  await expect(page.getByText(/moved into your kitchen/i)).toBeVisible();
});

test('Feedback: restyled chat empty state', async ({ page }) => {
  await page.goto('/feedback');
  await expect(page.getByRole('heading', { name: 'Feedback', exact: true })).toBeVisible();
  await expect(page.getByRole('log', { name: /feedback conversation/i })).toBeVisible();
  await expect(page.getByText(/A short back-and-forth/i)).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/05-feedback.png`, fullPage: true });
});
