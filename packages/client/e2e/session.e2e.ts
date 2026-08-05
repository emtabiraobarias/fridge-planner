import { test, expect } from '@playwright/test';

// Spec 002 US4 (FR-D-012/013/017) — the session surface in a real browser.
//
// The E2E gate boots with the dev auth seam, so there is no real IdP to redirect to;
// the sign-out REDIRECT itself is covered by unit tests (tests/context/AuthLogout).
// What only a browser can prove is what this asserts: the identity is actually
// rendered, the admin badge tracks the role, and the account controls did NOT become a
// fifth navigation destination.
test.describe.configure({ mode: 'serial' });

test('Home shows who you are signed in as (FR-D-012)', async ({ page }) => {
  await page.goto('/home');

  // At desktop BOTH mount points render — the Home surface and the sidebar footer —
  // which is the spec, so the locators are scoped to their containers rather than
  // matching a bare test id. (The first draft of this test matched both and failed
  // Playwright's strict mode, which is the ambiguity working as intended.)
  const homePanel = page.getByRole('main').getByTestId('account-panel');
  await expect(homePanel).toBeVisible();
  await expect(homePanel.getByTestId('account-identity')).toContainText(/signed in as/i);
  await expect(homePanel.getByRole('button', { name: /sign out/i })).toBeVisible();
});

test('the desktop sidebar carries the same control in its footer (FR-D-012)', async ({ page }) => {
  await page.goto('/home');
  const navPanel = page
    .getByRole('navigation', { name: 'Main navigation' })
    .getByTestId('account-panel');
  await expect(navPanel).toBeVisible();
  await expect(navPanel.getByRole('button', { name: /sign out/i })).toBeVisible();
});

test('the admin badge tracks the role, and is absent for an ordinary user (FR-D-012)', async ({
  browser,
}) => {
  const adminCtx = await browser.newContext({ extraHTTPHeaders: { 'x-user-roles': 'admin' } });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto('/home');
  await expect(adminPage.getByRole('main').getByTestId('account-admin-badge')).toBeVisible();
  await adminCtx.close();

  const userCtx = await browser.newContext({
    extraHTTPHeaders: { 'x-user-id': 'plain-user', 'x-user-roles': '' },
  });
  const userPage = await userCtx.newPage();
  await userPage.goto('/home');
  await expect(userPage.getByRole('main').getByTestId('account-identity')).toContainText(
    'plain-user',
  );
  await expect(userPage.getByTestId('account-admin-badge')).toHaveCount(0); // neither surface
  await userCtx.close();
});

// FR-D-017 is a constraint with a browser-level guard, because the failure mode it
// prevents (a fifth item in a layout tuned for four) is only visible when rendered.
test('the account controls are NOT a fifth navigation destination (FR-D-017)', async ({ page }) => {
  await page.goto('/home');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link')).toHaveCount(4);
  await expect(nav.getByRole('link', { name: /account|sign in|sign out/i })).toHaveCount(0);
});
