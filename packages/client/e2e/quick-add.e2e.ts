import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

// Intelligent quick-add understanding (spec 005): extended grammar, multi-item,
// tap-to-correct chips (incl. 320px), and the Groceries entry point — against a
// real build + in-memory Mongo. No OPENAI_API_KEY here, so the AI-assist path
// exercises its fail-open contract (FR-IQ-021) implicitly.
test.describe.configure({ mode: 'serial' });

test('Kitchen: extended grammar + multi-item + tap-to-correct (FR-IQ-001..006, 010..014)', async ({
  page,
}) => {
  await page.goto('/');
  const input = page.getByLabel('Quick add item');

  // Spelled-out unit + explicit location + expiry vocabulary in one phrase.
  await input.fill('500 grams mince in the freezer use by 20/7');
  await expect(page.getByRole('group', { name: /parsed item Mince/i })).toBeVisible();
  await expect(page.getByRole('button', { name: /quantity: 500 g/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /location: freezer/ })).toBeVisible();
  await input.press('Enter');
  await expect(page.getByText('Mince', { exact: true })).toBeVisible();

  // Multi-item input previews one correctable row per item.
  await input.fill('milk 2L, 6 eggs');
  await expect(page.getByRole('group', { name: /parsed item Milk/i })).toBeVisible();
  await expect(page.getByRole('group', { name: /parsed item Eggs/i })).toBeVisible();
  await input.press('Enter');
  await expect(page.getByText('Eggs', { exact: true })).toBeVisible();

  // Tap-to-correct: a guessed location chip → picker → corrected (explicit).
  await input.fill('tortillas');
  await page.getByRole('button', { name: /location: fridge \(guessed\)/ }).click();
  await page.getByRole('option', { name: 'pantry' }).click();
  await expect(page.getByRole('button', { name: 'location: pantry' })).toBeVisible();

  // The chip row stays usable at 320px (mobile-first).
  await page.setViewportSize({ width: 320, height: 800 });
  await expect(page.getByRole('button', { name: 'location: pantry' })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/06-quick-add-chips-320.png` });
  await page.setViewportSize({ width: 1280, height: 720 });
  await input.press('Enter');
  await expect(page.getByRole('listitem', { name: 'Tortillas' })).toBeVisible();
});

test('Groceries: shared parser + multi quick-add (FR-IQ-007)', async ({ page }) => {
  await page.goto('/grocery');
  const input = page.getByLabel('Add grocery item');
  // Names chosen not to collide with redesign.e2e.ts's grocery flow (shared dev user/state).
  await input.fill('2 limes, sesame oil');
  await expect(page.getByRole('group', { name: /parsed item Limes/i })).toBeVisible();
  await expect(page.getByRole('group', { name: /parsed item Sesame Oil/i })).toBeVisible();
  await input.press('Enter');
  await expect(page.getByText('Limes', { exact: true })).toBeVisible();
  await expect(page.getByText('Sesame Oil', { exact: true })).toBeVisible();
  await page.screenshot({ path: `${SHOTS}/07-grocery-quick-add.png` });
});
