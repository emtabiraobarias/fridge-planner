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
