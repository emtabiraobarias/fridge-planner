import { test, expect } from '@playwright/test';

// FR-002 / spec 004 FR-UI-019 (revised): an inventory item's expiry date and
// location are updatable from the row's edit control; expiry is also clearable.
test('edit an item: change location and expiry, then clear the expiry (FR-UI-019 revised)', async ({
  page,
}) => {
  await page.goto('/');

  // Add a distinctive item (quick-add, expires in 3 days, defaults to fridge).
  const input = page.getByLabel('Quick add item');
  await input.fill('600g salmon exp 3d');
  await input.press('Enter');
  const row = page.getByRole('listitem').filter({ hasText: 'Salmon' }).first();
  await expect(row).toBeVisible();
  // Location is read from the shelf the chip sits under, not from the chip itself: the
  // spec-010 chip dropped its `category · location` line, because the shelf heading
  // already states the location and the chip has only ~240px to work with.
  const onShelf = (shelf: RegExp) =>
    page.getByRole('region', { name: shelf }).getByRole('listitem').filter({ hasText: 'Salmon' });
  await expect(onShelf(/fridge shelf/i)).toHaveCount(1);

  // Edit → move to freezer + set a specific date.
  await row.getByRole('button', { name: /edit salmon/i }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Expiry date').fill('2026-08-01');
  await dialog.getByRole('radio', { name: 'Freezer' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).not.toBeVisible();

  // The chip moved shelves, and shows the new (far-out) expiry.
  await expect(onShelf(/freezer shelf/i)).toHaveCount(1);
  await expect(onShelf(/fridge shelf/i)).toHaveCount(0);
  await expect(row).toContainText(/fresh for weeks|days left|expires/i);

  // Edit again → clear the expiry entirely.
  await row.getByRole('button', { name: /edit salmon/i }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'No expiry' }).click();
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(row).toContainText(/no expiry/i);
});
