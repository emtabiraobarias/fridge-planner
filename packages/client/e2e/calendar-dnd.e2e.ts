import { test, expect } from '@playwright/test';

// Feedback 6a57677b: rearrange planned meals + details modal.
//   Scenario 1 (FR-022): drag a planned meal to a different slot → it moves.
//   Scenario 2 (FR-024): click a planned meal → modal with details + recipe link.
// Tap-to-place stays the primary flow (spec 004 FR-UI-026) — drag is the enhancement.
// Serial: the second test uses the meal the first test placed.
test.describe.configure({ mode: 'serial' });

const TILE = /^(breakfast|lunch|dinner|snack): /;

test('clicking a planned meal opens details with a recipe link (FR-024)', async ({ page }) => {
  await page.goto('/calendar');

  // Place a meal via tap-to-place (popular fallback — deterministic, links included).
  await page.getByRole('button', { name: /get suggestions/i }).click();
  const place = page.getByRole('button', { name: /place on calendar/i }).first();
  await expect(place).toBeVisible({ timeout: 30_000 });
  await place.click();
  await page.getByRole('button', { name: /place here/i }).first().click();

  const tile = page.getByLabel(TILE).first();
  await expect(tile).toBeVisible();

  // Click (not drag) → detail modal with the recipe link, opening a new tab.
  await tile.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  const link = dialog.getByRole('link', { name: /view recipe/i });
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('href', /^https?:\/\/.+/);
  await page.keyboard.press('Escape');
  await expect(dialog).not.toBeVisible();
});

test('dragging a planned meal to another slot moves it (FR-022)', async ({ page }) => {
  await page.goto('/calendar');

  const tile = page.getByLabel(TILE).first();
  await expect(tile).toBeVisible();

  // Drag the tile onto an empty snack slot (guaranteed empty: placement used the
  // first breakfast slot). dnd-kit needs >6px movement before the drag activates.
  const target = page.getByRole('button', { name: /snack slot/i }).first();
  const src = await tile.boundingBox();
  const dst = await target.boundingBox();
  if (!src || !dst) throw new Error('missing bounding boxes for drag');

  await page.mouse.move(src.x + src.width / 2, src.y + src.height / 2);
  await page.mouse.down();
  await page.mouse.move(src.x + src.width / 2 + 12, src.y + src.height / 2, { steps: 3 });
  await page.mouse.move(dst.x + dst.width / 2, dst.y + dst.height / 2, { steps: 12 });
  await page.mouse.up();

  // The meal now lives in the snack slot and the move is confirmed.
  await expect(page.getByText(/moved to .* snack/i)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel(/^snack: /)).toBeVisible();

  // Persistence (FR-023): still in the snack slot after reload.
  await page.reload();
  await expect(page.getByLabel(/^snack: /)).toBeVisible({ timeout: 15_000 });
});
