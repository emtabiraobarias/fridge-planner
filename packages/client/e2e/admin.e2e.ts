import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

// Spec 011 US2 (FR-AD-002/009/014, SC-AD-001/002) — the maintainer's triage journey.
// The feedback-collector agent is mocked at the edge by e2e/start-server.mjs, so the
// seeded records are real, schema-valid FeedbackRecords created through the real API.
test.describe.configure({ mode: 'serial' });

const AS_ADMIN = { 'x-user-roles': 'admin' };
const AS_USER_A = { 'x-user-id': 'user-a' };

test('an end user submits feedback and the maintainer finds it in admin triage (SC-AD-002)', async ({
  page,
}) => {
  const title = `Admin triage ${randomUUID().slice(0, 8)}`;

  // 1. An ORDINARY user files a report — no admin role anywhere in this call.
  const submitted = await page.request.post('/api/v1/feedback', {
    data: { message: title },
    headers: AS_USER_A,
  });
  expect(submitted.status()).toBeLessThan(300);

  // 2. That same user cannot see the admin surface at all.
  const asUser = await page.request.get('/api/v1/admin/feedback', { headers: AS_USER_A });
  expect(asUser.status()).toBe(403);

  // 3. The maintainer sees it — the report reached them with no out-of-band relay,
  //    which is the whole of SC-AD-002 and the reason this feature exists.
  const asAdmin = await page.request.get('/api/v1/admin/feedback', { headers: AS_ADMIN });
  expect(asAdmin.status()).toBe(200);
  const { feedback } = (await asAdmin.json()) as {
    feedback: Array<{ title?: string; userId: string }>;
  };
  const found = feedback.find((f) => f.title === title);
  expect(found).toBeDefined();
  expect(found?.userId).toBe('user-a'); // attributed to its author (FR-AD-009)
});

test('the admin screen lists cross-user reports and refuses a non-admin (FR-AD-002)', async ({
  browser,
}) => {
  // Administrator context — sees the triage screen.
  const adminCtx = await browser.newContext({ extraHTTPHeaders: AS_ADMIN });
  const adminPage = await adminCtx.newPage();
  await adminPage.request.post('/api/v1/feedback', {
    data: { message: `Visible ${randomUUID().slice(0, 8)}` },
    headers: AS_USER_A,
  });

  await adminPage.goto('/admin');
  await expect(adminPage.getByRole('heading', { name: 'Administration' })).toBeVisible();
  await expect(adminPage.getByRole('list', { name: 'Feedback reports' })).toBeVisible();
  await adminPage.screenshot({ path: `${SHOTS}/15-admin-triage.png`, fullPage: true });
  await adminCtx.close();

  // Ordinary user navigating STRAIGHT to /admin: the route is not secret, it is
  // refused — by the API, not by hiding the link (FR-AD-002).
  const userCtx = await browser.newContext({ extraHTTPHeaders: AS_USER_A });
  const userPage = await userCtx.newPage();
  await userPage.goto('/admin');
  await expect(userPage.getByText(/do not have access/i)).toBeVisible();
  await expect(userPage.getByRole('button', { name: /promote/i })).toHaveCount(0);
  await userCtx.close();
});

test('the admin entry point appears only for an administrator', async ({ browser }) => {
  const adminCtx = await browser.newContext({ extraHTTPHeaders: AS_ADMIN });
  const adminPage = await adminCtx.newPage();
  await adminPage.goto('/feedback');
  await expect(adminPage.getByRole('link', { name: /open administration/i })).toBeVisible();
  await adminCtx.close();

  const userCtx = await browser.newContext({ extraHTTPHeaders: AS_USER_A });
  const userPage = await userCtx.newPage();
  await userPage.goto('/feedback');
  await expect(userPage.getByRole('link', { name: /open administration/i })).toHaveCount(0);
  await userCtx.close();
});

// Spec 011 US3 (FR-AD-015/016/021) — the read-only support view.
test('the maintainer can inspect a reporter’s kitchen read-only; an end user cannot', async ({
  page,
}) => {
  // Give user-a something to look at, through the real inventory API as that user.
  const created = await page.request.post('/api/v1/inventory', {
    data: {
      name: 'Support Spinach',
      quantity: 1,
      unit: 'bunch',
      category: 'Produce',
      location: 'fridge',
    },
    headers: AS_USER_A,
  });
  expect(created.status()).toBeLessThan(300);

  // Administrator sees it…
  const asAdmin = await page.request.get('/api/v1/admin/users/user-a/data', { headers: AS_ADMIN });
  expect(asAdmin.status()).toBe(200);
  const body = (await asAdmin.json()) as {
    userId: string;
    inventory: Array<{ name: string }>;
  };
  expect(body.userId).toBe('user-a');
  expect(body.inventory.some((i) => i.name === 'Support Spinach')).toBe(true);

  // …an ordinary user does not, even for their OWN id — this surface is admin-only,
  // and `001` FR-036 already gives them their data through the normal endpoints.
  const asUser = await page.request.get('/api/v1/admin/users/user-a/data', { headers: AS_USER_A });
  expect(asUser.status()).toBe(403);

  // The route offers no write verb at all (FR-AD-015) — read-only by absence.
  const write = await page.request.delete('/api/v1/admin/users/user-a/data', { headers: AS_ADMIN });
  expect(write.status()).toBe(405);
});

// ─── Spec 011 US4/US6/US7 — the surfaces that shipped API-only in 4.12.0 ──────
//
// These journeys exist because the capabilities below were *enforced* from 4.12.0 but
// could only be exercised with a hand-written curl. A test that only hits the API would
// have passed for the entire time the feature was unusable, which is exactly how the
// gap survived a full release — so each of these drives the real controls.

test('the maintainer can read readiness and pull the AI kill switch (FR-AD-024/026)', async ({
  page,
}) => {
  await page.context().setExtraHTTPHeaders(AS_ADMIN);
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Operations' }).click();

  // Readiness names each dependency (SC-AD-005) rather than reporting one opaque bit.
  await expect(page.getByTestId('readiness-overall')).toBeVisible();
  await expect(page.getByTestId('dependency-mongodb')).toBeVisible();

  const state = page.getByTestId('ai-state');
  await expect(state).toHaveText('Enabled');

  // Pulling the switch must change the SERVER's answer, not just the label.
  await page.getByRole('button', { name: 'Disable AI' }).click();
  await expect(state).toHaveText('Disabled');
  const off = await page.request.get('/api/v1/admin/settings', { headers: AS_ADMIN });
  expect(((await off.json()) as { settings: Record<string, unknown> }).settings['ai.enabled']).toBe(
    false,
  );

  // Restore — every other e2e file shares this runtime setting (workers: 1, serial).
  await page.getByRole('button', { name: 'Enable AI' }).click();
  await expect(state).toHaveText('Enabled');
  const on = await page.request.get('/api/v1/admin/settings', { headers: AS_ADMIN });
  expect(((await on.json()) as { settings: Record<string, unknown> }).settings['ai.enabled']).toBe(
    true,
  );

  await page.screenshot({ path: `${SHOTS}/16-admin-ops.png`, fullPage: true });
});

test('erasing an account requires an explicit confirmation (FR-AD-018)', async ({ page }) => {
  // A throwaway identity, so the erase cannot disturb any other test.
  const victim = `e2e-erase-${randomUUID().slice(0, 8)}`;
  const seeded = await page.request.post('/api/v1/inventory', {
    data: { name: 'Doomed Leek', quantity: 1, unit: 'ea', category: 'Produce', location: 'fridge' },
    headers: { 'x-user-id': victim },
  });
  expect(seeded.status()).toBeLessThan(300);

  await page.context().setExtraHTTPHeaders(AS_ADMIN);
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Accounts' }).click();
  await page.getByLabel('User ID').fill(victim);

  // Opening the confirmation is NOT the action. If this ever erases on the first
  // click, the account is gone before the maintainer has read the sentence explaining
  // what erasure means.
  await page.getByRole('button', { name: 'Erase…' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Confirm erase' })).toBeVisible();
  const stillThere = await page.request.get('/api/v1/inventory', {
    headers: { 'x-user-id': victim },
  });
  expect(stillThere.status()).toBe(200);

  // Cancelling likewise leaves them alone.
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Confirm erase' })).toHaveCount(0);
  expect(
    (await page.request.get('/api/v1/inventory', { headers: { 'x-user-id': victim } })).status(),
  ).toBe(200);

  // Confirming does erase — and the panel says how long it stays recoverable rather
  // than implying the account is already gone for good (FR-AD-019).
  await page.getByRole('button', { name: 'Erase…' }).click();
  await page.getByRole('button', { name: 'Yes, erase' }).click();
  await expect(page.getByTestId('accounts-notice')).toContainText(/recoverable for \d+ days/i);

  // The principal seam refuses them immediately (FR-AD-018), not on next login.
  const afterErase = await page.request.get('/api/v1/inventory', {
    headers: { 'x-user-id': victim },
  });
  expect(afterErase.status()).toBeGreaterThanOrEqual(400);

  await page.screenshot({ path: `${SHOTS}/17-admin-accounts.png`, fullPage: true });
});

test('runtime settings change behaviour without a restart (FR-AD-030)', async ({ page }) => {
  await page.context().setExtraHTTPHeaders(AS_ADMIN);
  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Settings' }).click();

  const limit = page.getByLabel('Recommendations per minute');
  await expect(limit).toHaveValue('10'); // the code default, with an empty collection

  await limit.fill('7');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText(/no restart/i);

  const saved = await page.request.get('/api/v1/admin/settings', { headers: AS_ADMIN });
  const body = (await saved.json()) as { settings: Record<string, unknown> };
  expect(body.settings['limits.recommendationsPerMinute']).toBe(7);

  // Restore the default so later specs see the shipped rate limit.
  await limit.fill('10');
  await page.getByRole('button', { name: 'Save settings' }).click();
  await expect(page.getByRole('status')).toContainText(/no restart/i);
});
