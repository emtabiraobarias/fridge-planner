import { test, expect } from '@playwright/test';

// FR-015 / FR-037: every displayed meal recommendation links to a real recipe page,
// opening in a new tab. Runs against the E2E stack (no Holodeck agent → the popular
// fallback is served, whose entries carry hand-verified links on approved domains),
// so the assertion is deterministic and needs no recipe-search API keys.
//
// Covers BOTH recommendation surfaces: the Kitchen panel (RecommendationsPanel →
// MealCard) and the Calendar suggestions rail (SuggestionsRail — the original bug:
// it rendered meals without the link).

async function expectRecipeLinks(page: import('@playwright/test').Page): Promise<void> {
  const links = page.getByRole('link', { name: /view recipe/i });
  await expect(links.first()).toBeVisible({ timeout: 30_000 });
  const count = await links.count();
  expect(count).toBeGreaterThan(0);
  for (let i = 0; i < count; i++) {
    const link = links.nth(i);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await expect(link).toHaveAttribute('href', /^https?:\/\/.+/);
  }
}

test('Kitchen: every recommended meal shows a recipe link that opens a new tab (FR-037)', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /get recommendations/i }).click();
  await expectRecipeLinks(page);
});

test('Calendar rail: every suggestion shows a recipe link (FR-037 — SuggestionsRail regression)', async ({ page }) => {
  await page.goto('/calendar');
  // Fresh page → empty client context → the "Get suggestions" button is present.
  await page.getByRole('button', { name: /get suggestions/i }).click();
  await expectRecipeLinks(page);
});
