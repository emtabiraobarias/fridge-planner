import { test, expect, type APIRequestContext, type Locator, type Page } from '@playwright/test';
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
// Erasure is destructive to the identity itself, so US7 uses its own reporter. Erasing the
// shared one made every later test file as a deleted account — which is how this file first
// went green in isolation and red in the suite.
const ERASE_REPORTER = { 'x-user-id': 'reporter-e2e-erase' };

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


/**
 * Open an item's modal. Every control an item offers lives there now, not on its row — so the
 * row is a single button, and the dialog is where the maintainer acts. The dialog STAYS open
 * across actions (the panel refreshes beneath it), so a whole journey runs inside one.
 */
async function idFor(page: Page, title: string): Promise<string> {
  const queue = await page.request.get('/api/v1/admin/lifecycle', { headers: AS_ADMIN });
  const { items } = (await queue.json()) as { items: { _id: string; sourceTitle: string }[] };
  const id = items.find((i) => i.sourceTitle === title)?._id;
  if (!id) throw new Error(`no lifecycle item for ${title}`);
  return id;
}

async function openItem(page: Page, section: string, title: string): Promise<Locator> {
  await page
    .locator(`section[aria-label="${section}"] li`, { hasText: title })
    .getByRole('button')
    .first()
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test('a completed report reaches the triage queue and the maintainer accepts it through the UI (FR-FL-008/023)', async ({
  page,
}) => {
  const title = await fileReport(page.request);

  await page.goto('/admin');
  const dialog = await openItem(page, 'Triage queue', title);

  // Drive the button, then assert the SERVER's answer changed — not the rendered label.
  await dialog.getByRole('button', { name: /^Accept$/ }).click();
  await expect(dialog.getByRole('button', { name: /^Accept$/ })).toBeHidden();

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
  const dialog = await openItem(page, 'Triage queue', title);

  await dialog.getByRole('button', { name: /^Dismiss$/ }).click();
  // The reason is part of the decision — the item must not have moved yet.
  const midway = await page.request.get('/api/v1/admin/lifecycle?stage=new', { headers: AS_ADMIN });
  const mid = (await midway.json()) as { items: { sourceTitle: string }[] };
  expect(mid.items.some((i) => i.sourceTitle === title)).toBe(true);

  await dialog.getByRole('button', { name: /Declined/ }).click();
  // Wait for the UI to settle before querying the API. `click()` resolves when the click is
  // dispatched, not when its request lands — asserting straight afterwards races the PATCH and
  // reads the pre-click stage. (This is what made this test flake: the dismiss HAD applied.)
  await expect(dialog.getByRole('button', { name: /^Dismiss$/ })).toBeHidden();
  await expect(dialog).toContainText(/Dismissed/i);

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

// ── US4 — gates, driven through the delivery surface ─────────────────────────

test('the maintainer walks an item to shipped through the gates, and a rejection sends it back (FR-FL-009/010/064)', async ({
  page,
}) => {
  const title = await fileReport(page.request);

  // Seed forward to in-review through the API — the assertion below is about the GATES.
  const queue = await page.request.get('/api/v1/admin/lifecycle?stage=new', { headers: AS_ADMIN });
  const { items } = (await queue.json()) as { items: { _id: string; sourceTitle: string }[] };
  const id = items.find((i) => i.sourceTitle === title)!._id;
  for (const action of ['accept', 'advance', 'advance', 'approve-spec', 'advance']) {
    const r = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
      data: { action },
      headers: AS_ADMIN,
    });
    expect(r.status(), action).toBe(200);
  }

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Delivery' }).click();
  const dialog = await openItem(page, 'Delivery', title);

  // FR-FL-064 — "changes needed" must have somewhere to send the work.
  await dialog.getByRole('button', { name: /Changes needed/ }).click();
  await expect(page.getByTestId(`delivery-stage-${id}`)).toHaveText(/In progress/i);


  // Forward again, then the release gate.
  await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
    data: { action: 'advance' },
    headers: AS_ADMIN,
  });
  await page.reload();
  await page.getByRole('tab', { name: 'Delivery' }).click();
  const shipDialog = await openItem(page, 'Delivery', title);
  await shipDialog.getByRole('button', { name: /Approve release/ }).click();
  // Same rule as the dismiss test: wait for the UI to settle, or the API read races the PATCH.
  await expect(shipDialog.getByTestId(`modal-stage-${id}`)).toHaveText(/Shipped/i);

  const after = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  const body = (await after.json()) as {
    stage: string;
    transitions: { to: string; isGateApproval: boolean }[];
  };
  expect(body.stage).toBe('shipped');
  // SC-FL-006 — shipped only via a RECORDED approval.
  expect(body.transitions.some((t) => t.to === 'shipped' && t.isGateApproval)).toBe(true);
});

// ── US6 — a merged reporter must not learn anything about the target ─────────

test('a merged reporter sees a status and nothing about the other report (FR-FL-019)', async ({
  page,
}) => {
  const targetTitle = await fileReport(page.request);
  const dupeTitle = `Lifecycle dupe ${Date.now()}`;
  await page.request.post('/api/v1/feedback', {
    data: { message: dupeTitle },
    headers: { 'x-user-id': 'reporter-e2e-2' },
  });

  const queue = await page.request.get('/api/v1/admin/lifecycle', { headers: AS_ADMIN });
  const { items } = (await queue.json()) as { items: { _id: string; sourceTitle: string }[] };
  const targetId = items.find((i) => i.sourceTitle === targetTitle)!._id;
  const dupeId = items.find((i) => i.sourceTitle === dupeTitle)!._id;

  const merged = await page.request.patch(`/api/v1/admin/lifecycle/${dupeId}`, {
    data: { action: 'merge', targetId },
    headers: AS_ADMIN,
  });
  expect(merged.status()).toBe(200);

  const asDupeReporter = await page.request.get('/api/v1/lifecycle', {
    headers: { 'x-user-id': 'reporter-e2e-2' },
  });
  const wire = await asDupeReporter.text();
  expect(wire).toContain('mergedTargetStage');
  // The whole point of D14: a status, and nothing else about someone else's report.
  expect(wire).not.toContain(targetTitle);
  expect(wire).not.toContain(targetId);
});

// ── US7 — work outlives an erased account ────────────────────────────────────

test('an erased reporter’s in-flight work survives, detached, and still advances (FR-FL-059/061)', async ({
  page,
}) => {
  const title = `Lifecycle erase ${Date.now()}`;
  const filed = await page.request.post('/api/v1/feedback', {
    data: { message: title },
    headers: ERASE_REPORTER,
  });
  expect(filed.status()).toBeLessThan(300);
  const queue = await page.request.get('/api/v1/admin/lifecycle?stage=new', { headers: AS_ADMIN });
  const { items } = (await queue.json()) as { items: { _id: string; sourceTitle: string }[] };
  const id = items.find((i) => i.sourceTitle === title)!._id;

  await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
    data: { action: 'accept' },
    headers: AS_ADMIN,
  });

  // Erasure is TWO-PHASE (spec 011 FR-AD-018): the account becomes inaccessible now, and the
  // data is purged only after the 30-day window. Detachment happens at PURGE, which no e2e can
  // reach without fast-forwarding a month — so that half is asserted in
  // `lifecycle-merge-erasure.test.ts`, which calls `purgeUserData` directly.
  //
  // What IS observable here, and is the point of FR-FL-059: erasing the reporter does not take
  // their in-flight work with it.
  await page.request.post('/api/v1/admin/users/reporter-e2e-erase/erase', { headers: AS_ADMIN });

  const after = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  expect(after.status()).toBe(200);
  const item = (await after.json()) as { stage: string; sourceTitle: string };
  expect(item.stage).toBe('accepted');

  const advanced = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
    data: { action: 'advance' },
    headers: AS_ADMIN,
  });
  expect(advanced.status()).toBe(200);
});

// ── US5 — closure, including with the release list unavailable ───────────────

test('closing tells the reporter, and still works when the release list is down (FR-FL-044, SC-FL-008)', async ({
  page,
}) => {
  const title = await fileReport(page.request);
  const queue = await page.request.get('/api/v1/admin/lifecycle?stage=new', { headers: AS_ADMIN });
  const { items } = (await queue.json()) as { items: { _id: string; sourceTitle: string }[] };
  const id = items.find((i) => i.sourceTitle === title)!._id;

  for (const action of ['accept', 'advance', 'advance', 'approve-spec', 'advance', 'approve-release']) {
    const r = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
      data: { action },
      headers: AS_ADMIN,
    });
    expect(r.status(), action).toBe(200);
  }

  // Force the picker to be unavailable at the network edge — closure must proceed regardless.
  await page.route('**/api/v1/admin/releases', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        releases: [],
        available: false,
        unavailableReason: 'The release list is unreachable.',
      }),
    }),
  );

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Delivery' }).click();
  const dialog = await openItem(page, 'Delivery', title);
  await dialog.getByRole('button', { name: /^Close$/ }).click();

  // It must SAY WHY rather than silently offering a text box.
  await expect(page.getByRole('status')).toContainText(/unreachable/i);
  await page.getByLabel('Release (free text)').fill('the 25 Aug release');
  await page.getByRole('button', { name: /Close and tell the reporter/ }).click();
  // Wait for the UI to settle before reading the API — `closed` is not a delivery stage, so the
  // row leaves the list. (Third instance of this race in this file: `click()` resolves on
  // dispatch, not on the request landing.)
  await expect(dialog).toBeHidden();

  const after = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  const item = (await after.json()) as {
    stage: string;
    closure?: { excerpt: string; releaseFallbackText?: string };
  };
  expect(item.stage).toBe('closed');
  expect(item.closure?.releaseFallbackText).toBe('the 25 Aug release');

  // And the reporter sees the excerpt (FR-FL-048).
  const asReporter = await page.request.get('/api/v1/lifecycle', { headers: AS_REPORTER });
  expect(await asReporter.text()).toContain(item.closure!.excerpt);
});

// ── US3 — clauses are vetted before anything reaches spec ───────────────────

test('advancing to spec is blocked until every clause is vetted (FR-FL-028, SC-FL-005)', async ({
  page,
}) => {
  const title = await fileReport(page.request);
  const queue = await page.request.get('/api/v1/admin/lifecycle?stage=new', { headers: AS_ADMIN });
  const { items } = (await queue.json()) as { items: { _id: string; sourceTitle: string }[] };
  const id = items.find((i) => i.sourceTitle === title)!._id;

  for (const action of ['accept', 'advance']) {
    await page.request.patch(`/api/v1/admin/lifecycle/${id}`, { data: { action }, headers: AS_ADMIN });
  }

  // The agent cannot be relied on here, so the clauses are seeded through the real endpoint —
  // the assertion is about the VETTING GATE, not about drafting quality.
  await page.request.post(`/api/v1/admin/lifecycle/${id}/clauses`, {
    data: { text: 'The system shall collapse duplicate rows.', derivedFrom: 'rows duplicate' },
    headers: AS_ADMIN,
  });

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Delivery' }).click();
  // Scoped to THIS item's dialog: more than one item can sit at `briefed` once the whole suite
  // has run, and an unscoped locator then matches several and trips strict mode.
  const clauseDialog = await openItem(page, 'Delivery', title);
  const panel = clauseDialog.locator('div[aria-label="Clause vetting"]');
  await expect(panel).toBeVisible();
  // A manually authored clause is already vetted, so this one should read as accepted.
  await expect(panel).toContainText(/can go to spec/i);

  // Now add a PENDING one via the agent path and confirm the gate closes again.
  await page.request.post(`/api/v1/admin/lifecycle/${id}/clauses`, {
    data: {},
    headers: AS_ADMIN,
  });
  const blocked = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
    data: { action: 'advance' },
    headers: AS_ADMIN,
  });
  // Either the agent drafted (409, pending) or it could not (200, nothing pending) — both are
  // legitimate; what must never happen is advancing WITH something pending.
  const after = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  const item = (await after.json()) as { stage: string; clauses: { vetted: string }[] };
  const pending = item.clauses.filter((c) => c.vetted === 'pending').length;
  if (pending > 0) {
    expect(blocked.status()).toBe(409);
    expect(item.stage).toBe('briefed');
  }
});

// ── The item modal on a phone ───────────────────────────────────────────────
//
// `responsive.e2e.ts` runs on all five viewport projects but only walks the five main
// screens — `/admin` is not among them, so nothing there was ever measured at 390px. These
// set the viewport explicitly instead of adding a sixth screen to that sweep, which would
// multiply the whole spec ×5 for one panel.

const PHONE = { width: 390, height: 844 };

test('the item modal is a bottom sheet on a phone, with nothing clipped (FR-RS-023)', async ({
  page,
}) => {
  await page.setViewportSize(PHONE);
  const title = await fileReport(page.request);

  await page.goto('/admin');
  const dialog = await openItem(page, 'Triage queue', title);

  // A sheet, not a centred dialog: full width and anchored to the bottom edge.
  // The sheet slides up over 260ms — measure once it has landed, or this reads a frame of the
  // entrance animation and reports a bottom edge below the fold.
  await dialog.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );
  const box = (await dialog.boundingBox())!;
  expect(box.width).toBe(PHONE.width);
  expect(Math.round(box.y + box.height)).toBe(PHONE.height);

  // Every control inside it is reachable — the FeedbackHistory defect was exactly this:
  // an action group 4px wider than the viewport, clipped, with the page never scrolling.
  const clipped = await dialog.evaluate((el, w) =>
    Array.from(el.querySelectorAll('button, input, select, textarea'))
      .filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && (r.left < -1 || r.right > w + 1);
      })
      .map((c) => c.textContent?.trim().slice(0, 30) ?? c.tagName),
    PHONE.width,
  );
  expect(clipped, 'controls clipped outside the phone viewport').toEqual([]);

  // And the page behind it still does not scroll sideways.
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);

  await page.screenshot({ path: `${SHOTS}/lifecycle-modal-phone.png`, fullPage: false });
});

test('the closure form never trips the iOS auto-zoom floor (SC-RS-003)', async ({ page }) => {
  await page.setViewportSize(PHONE);
  const title = await fileReport(page.request);
  const id = await idFor(page, title);

  for (const action of ['accept', 'advance', 'advance', 'approve-spec', 'advance', 'approve-release']) {
    await page.request.patch(`/api/v1/admin/lifecycle/${id}`, { data: { action }, headers: AS_ADMIN });
  }

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Delivery' }).click();
  const dialog = await openItem(page, 'Delivery', title);
  await dialog.getByRole('button', { name: /^Close$/ }).click();

  // iOS Safari zooms toward a focused control under 16px and never zooms back out. The
  // responsive sweep never opens this form, so its sub-16px fields went unmeasured.
  const tooSmall = await dialog.evaluate((el) =>
    Array.from(el.querySelectorAll('input, textarea, select'))
      .filter((c) => {
        const r = c.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && parseFloat(getComputedStyle(c).fontSize) < 16;
      })
      .map((c) => `${c.getAttribute('aria-label') ?? c.id ?? c.tagName}: ${getComputedStyle(c).fontSize}`),
  );
  expect(tooSmall, 'sub-16px controls in the closure form — iOS will auto-zoom').toEqual([]);
});
