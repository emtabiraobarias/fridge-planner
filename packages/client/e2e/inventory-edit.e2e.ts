import { test, expect } from '@playwright/test';

// FR-002 / spec 004 FR-UI-019 (revised): an inventory item's expiry date and
// location are updatable from the row's edit control; expiry is also clearable.
test('edit an item: change location and expiry, then clear the expiry (FR-UI-019 revised)', async ({ page }) => {
  await page.goto('/');

  // Add a distinctive item (quick-add, expires in 3 days, defaults to fridge).
  const input = page.getByLabel('Quick add item');
  await input.fill('600g salmon exp 3d');
  await input.press('Enter');
  const row = page.getByRole('listitem').filter({ hasText: 'Salmon' }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(/fridge/i);

  // Edit → move to freezer + set a specific date.
  await row.getByRole('button', { name: /edit salmon/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Expiry date').fill('2026-08-01');
  await dialog.getByRole('radio', { name: 'Freezer' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).not.toBeVisible();

  // Row reflects the new location and the new (far-out) expiry.
  await expect(row).toContainText(/freezer/i);
  await expect(row).toContainText(/fresh for weeks|days left|expires/i);

  // Edit again → clear the expiry entirely.
  await row.getByRole('button', { name: /edit salmon/i }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'No expiry' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row).toContainText(/no expiry/i);
});
