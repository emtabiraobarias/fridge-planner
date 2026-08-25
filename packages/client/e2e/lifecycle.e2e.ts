import { test, expect, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

/**
 * Spec 012 US1 — the maintainer triages an incoming report.
 *
 * Per CLAUDE.md §8 these DRIVE THE REAL CONTROLS rather than calling `page.request` for the
 * action under test. An e2e that only calls the API proves the server works, never that anyone
 * can reach it: spec 011 shipped three panels unbuilt with every server test green and the smoke
 * gate passing. Seeding still goes through the real API — that is setup, not the assertion.
 */
test.describe.configure({ mode: 'serial' });

const AS_ADMIN = { 'x-user-id': 'admin-e2e', 'x-user-roles': 'admin' };
const AS_REPORTER = { 'x-user-id': 'reporter-e2e' };

/** File a report as an ordinary reporter and return its title. */
async function fileReport(request: APIRequestContext): Promise<string> {
  const title = `Lifecycle ${randomUUID().slice(0, 8)}`;
  const res = await request.post('/api/v1/feedback', {
    data: { message: title },
    headers: AS_REPORTER,
  });
  expect(res.status()).toBeLessThan(300);
  return title;
}

test('a completed report reaches the triage queue and the maintainer accepts it through the UI (FR-FL-008/023)', async ({
  page,
}) => {
  const title = await fileReport(page.request);

  await page.goto('/admin');
  const row = page.locator('section[aria-label="Triage queue"] li', { hasText: title });
  await expect(row).toBeVisible();

  // Drive the button, then assert the SERVER's answer changed — not the rendered label.
  await row.getByRole('button', { name: /^Accept$/ }).click();
  await expect(row.getByRole('button', { name: /^Accept$/ })).toBeHidden();

  const queue = await page.request.get('/api/v1/admin/lifecycle', { headers: AS_ADMIN });
  const { items } = (await queue.json()) as { items: { sourceTitle: string; stage: string }[] };
  expect(items.find((i) => i.sourceTitle === title)?.stage).toBe('accepted');

  await page.screenshot({ path: `${SHOTS}/lifecycle-accepted.png`, fullPage: true });
});

test('dismissing requires a reason to be chosen, and records which one (FR-FL-016/017)', async ({
  page,
}) => {
  const title = await fileReport(page.request);

  await page.goto('/admin');
  const row = page.locator('section[aria-label="Triage queue"] li', { hasText: title });
  await expect(row).toBeVisible();

  await row.getByRole('button', { name: /^Dismiss$/ }).click();
  // The reason is part of the decision — the item must not have moved yet.
  const midway = await page.request.get('/api/v1/admin/lifecycle?stage=new', { headers: AS_ADMIN });
  const mid = (await midway.json()) as { items: { sourceTitle: string }[] };
  expect(mid.items.some((i) => i.sourceTitle === title)).toBe(true);

  await row.getByRole('button', { name: /Declined/ }).click();

  const after = await page.request.get('/api/v1/admin/lifecycle', { headers: AS_ADMIN });
  const { items } = (await after.json()) as {
    items: { sourceTitle: string; stage: string; dismissalReason?: string }[];
  };
  const found = items.find((i) => i.sourceTitle === title);
  expect(found?.stage).toBe('dismissed');
  expect(found?.dismissalReason).toBe('declined');
});

test('a reporter cannot reach the maintainer surface — 403, never 401 (FR-FL-055)', async ({
  page,
}) => {
  const res = await page.request.get('/api/v1/admin/lifecycle', { headers: AS_REPORTER });
  // 401 would trigger the client's refresh-and-retry and loop (FR-D-010), so the distinction
  // is behavioural, not cosmetic.
  expect(res.status()).toBe(403);
});

test('an illegal transition is refused and leaves the item where it was (FR-FL-003)', async ({
  page,
}) => {
  const title = await fileReport(page.request);

  const queue = await page.request.get('/api/v1/admin/lifecycle?stage=new', { headers: AS_ADMIN });
  const { items } = (await queue.json()) as { items: { _id: string; sourceTitle: string }[] };
  const id = items.find((i) => i.sourceTitle === title)?._id;
  expect(id).toBeDefined();

  const refused = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
    data: { action: 'approve-release' },
    headers: AS_ADMIN,
  });
  expect(refused.status()).toBe(409);

  const after = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  expect(((await after.json()) as { stage: string }).stage).toBe('new');
});
