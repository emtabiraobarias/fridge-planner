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
async function fileReport(
  request: APIRequestContext,
  as: Record<string, string> = AS_REPORTER,
): Promise<string> {
  const title = `Lifecycle ${randomUUID().slice(0, 8)}`;
  const res = await request.post('/api/v1/feedback', {
    data: { message: title },
    headers: as,
  });
  expect(res.status(), 'filing a report').toBeLessThan(300);
  return title;
}

/**
 * A reporter identity used by exactly one test.
 *
 * Feedback chat is rate-limited per user (`feedback-chat:${userId}`, 10/min), so several tests
 * filing as the shared `reporter-e2e` inside one minute get a 429 partway — and the failure
 * surfaces wherever the missing report was needed, not where the limit was hit.
 */
function ownReporter(): Record<string, string> {
  return { 'x-user-id': `reporter-e2e-${randomUUID().slice(0, 8)}` };
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

async function stageOf(page: Page, id: string): Promise<string> {
  const r = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  return ((await r.json()) as { stage: string }).stage;
}

async function recordIdFor(page: Page, id: string): Promise<string> {
  const r = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  return ((await r.json()) as { feedbackRecordId: string }).feedbackRecordId;
}

interface ReporterItem {
  sourceTitle: string;
  stageLabel: string;
  reply?: { text: string };
  closure?: { excerpt: string };
}

/** What the REPORTER sees — the projection, never the admin document. */
async function reporterView(
  page: Page,
  title: string,
  as: Record<string, string> = AS_REPORTER,
): Promise<ReporterItem> {
  const r = await page.request.get('/api/v1/lifecycle', { headers: as });
  const { items } = (await r.json()) as { items: ReporterItem[] };
  const found = items.find((i) => i.sourceTitle === title);
  if (!found) throw new Error(`reporter cannot see ${title}`);
  return found;
}

/**
 * Walk an item forward through the API.
 *
 * Attaches a pull request before an `advance` that would leave `in-progress`, because that is
 * the one conditional edge in the graph (FR-FL-067). Tests whose subject is something else —
 * the gates, injection-safety, closure — should not each have to know that; the one test that
 * IS about the condition asserts the refusal directly.
 */
async function walkTo(page: Page, id: string, actions: string[]): Promise<void> {
  for (const action of actions) {
    if (action === 'advance' && (await stageOf(page, id)) === 'in-progress') {
      await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
        data: {
          action: 'attach-artifact',
          artifact: { type: 'pull-request', ref: 'https://example.invalid/pull/1' },
        },
        headers: AS_ADMIN,
      });
    }
    const r = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
      data: { action },
      headers: AS_ADMIN,
    });
    expect(r.status(), action).toBe(200);
  }
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
  for (const action of ['accept', 'advance', 'advance', 'approve-spec']) {
    const r = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
      data: { action },
      headers: AS_ADMIN,
    });
    expect(r.status(), action).toBe(200);
  }
  // `in-progress` advances only when a PR exists (FR-FL-067). This test is about the GATES,
  // so it satisfies the condition rather than exercising its refusal — and the artifact
  // survives the gate-3 rejection below, so the second advance needs no second attach.
  await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
    data: { action: 'attach-artifact', artifact: { type: 'pull-request', ref: 'https://example.invalid/pull/1' } },
    headers: AS_ADMIN,
  });
  expect(
    (await page.request.patch(`/api/v1/admin/lifecycle/${id}`, { data: { action: 'advance' }, headers: AS_ADMIN })).status(),
  ).toBe(200);

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

  await walkTo(page, id, ['accept', 'advance', 'advance', 'approve-spec', 'advance', 'approve-release']);

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
  // The stand-in agent answers the clause-drafting mode, so there IS something pending and the
  // gate must close. This was previously written as "if the agent happened to draft, assert the
  // refusal" — which quietly passed whenever it drafted nothing, i.e. every run, leaving
  // SC-FL-005's headline guarantee unasserted end to end.
  const after = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  const item = (await after.json()) as { stage: string; clauses: { vetted: string }[] };
  expect(item.clauses.filter((c) => c.vetted === 'pending').length).toBeGreaterThan(0);
  expect(blocked.status()).toBe(409);
  expect(item.stage).toBe('briefed');
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

  // walkTo asserts each step; the silent loop this replaced left the item at `in-progress`
  // once FR-FL-067 landed, and the failure showed up as "Close never appeared".
  await walkTo(page, id, ['accept', 'advance', 'advance', 'approve-spec', 'advance', 'approve-release']);

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

// ── The controls the surface was missing until 2026-08-26 ──────────────────
//
// `edit-source` and `set-rank` existed server-side and in `services/lifecycle.ts` from the
// start, but nothing called them: reachable by curl, invisible in the app. That is the same
// gap class that let spec 011 ship three unbuilt panels behind green server tests, so these
// drive the real controls.

test('a title-less draft is listed and identifiable, but has nothing to act on', async ({
  page,
}) => {
  // DRAFT_HOLD_TRIGGER keeps the mocked agent asking, so the record never completes — which
  // is the only way to get a genuinely title-less record (FR-F-003).
  const said = `The calendar scrolls oddly ${randomUUID().slice(0, 8)} DRAFT_HOLD_TRIGGER`;
  const filed = await page.request.post('/api/v1/feedback', {
    data: { message: said },
    headers: { 'x-user-id': 'reporter-draft-e2e' },
  });
  expect(((await filed.json()) as { status: string }).status).toBe('draft');

  await page.goto('/admin');
  await page.getByRole('button', { name: /^Draft \(\d+\)$/ }).click();

  // A record has no title until the conversation completes, so the reporter's own words are
  // what identifies it — every draft otherwise reads "(untitled draft)".
  const row = page.locator('section[aria-label="Triage queue"] li', { hasText: said });
  await expect(row).toBeVisible();
  // No lifecycle item yet, so there is nothing to open.
  await expect(row.getByRole('button').first()).toBeDisabled();
});

test('a report can be edited before it briefs, and not after (FR-FL-020)', async ({ page }) => {
  const title = await fileReport(page.request);
  const id = await idFor(page, title);

  await page.goto('/admin');
  const dialog = await openItem(page, 'Triage queue', title);
  await dialog.getByRole('button', { name: /Edit details/ }).click();

  const edited = `${title} (clarified)`;
  await dialog.getByLabel(/^Title$/).fill(edited);
  await dialog.getByRole('button', { name: /Save details/ }).click();
  await expect(dialog).toContainText(edited);

  // The SERVER's answer, not the rendered label.
  const after = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  expect(((await after.json()) as { sourceTitle: string }).sourceTitle).toBe(edited);

  // Past `briefed` the text is off-limits: clauses were derived from it, so editing it would
  // silently invalidate what was vetted.
  for (const action of ['accept', 'advance']) {
    await page.request.patch(`/api/v1/admin/lifecycle/${id}`, { data: { action }, headers: AS_ADMIN });
  }
  await page.reload();
  await page.getByRole('tab', { name: 'Delivery' }).click();
  const briefed = await openItem(page, 'Delivery', edited);
  await expect(briefed.getByRole('button', { name: /Edit details/ })).toHaveCount(0);
});

test('a ranked item precedes an unranked one, however old (FR-FL-022)', async ({ page }) => {
  // A CONTROL filed after the ranked one, so recency alone would put it first. Asserting
  // relative order rather than absolute position keeps this independent of whatever else the
  // suite has already ranked — the requirement is an ordering, not a claim about position 1.
  const me = ownReporter();
  const ranked = await fileReport(page.request, me);
  const unranked = await fileReport(page.request, me);

  await page.goto('/admin');
  const dialog = await openItem(page, 'Triage queue', ranked);
  await dialog.getByRole('button', { name: /Edit details/ }).click();
  await dialog.getByLabel(/^Rank$/).fill('0');
  await dialog.getByRole('button', { name: /Set rank/ }).click();
  await expect(dialog).toContainText(/rank 0/i);

  const queue = await page.request.get('/api/v1/admin/lifecycle', { headers: AS_ADMIN });
  const { items } = (await queue.json()) as { items: { sourceTitle: string }[] };
  const titles = items.map((i) => i.sourceTitle);
  // Mongo sorts a missing field before every number ascending, so a plain `.sort({ rank: 1 })`
  // buried ranked items beneath unranked ones — the inverse of this requirement.
  expect(titles.indexOf(ranked)).toBeLessThan(titles.indexOf(unranked));
});

// ── The contract table, row by row ─────────────────────────────────────────
//
// The design's §06 "Every state, and who can move it" is the contract: *any action not listed
// against a state is refused*. These cover the rows the suite had no test for at all — park and
// reopen, the reply at `shipped`, `closed` never reopening but being citable, the deletion
// refusal, and the reporter-facing sentence for each state.



test('parking holds an item and reopening returns it to the exact stage it left (FR-FL-007)', async ({
  page,
}) => {
  const me = ownReporter();
  const title = await fileReport(page.request, me);
  const id = await idFor(page, title);
  await walkTo(page, id, ['accept', 'advance', 'advance', 'approve-spec']);
  expect(await stageOf(page, id)).toBe('in-progress');

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Delivery' }).click();
  const dialog = await openItem(page, 'Delivery', title);
  await dialog.getByRole('button', { name: /^Park$/ }).click();
  await expect(dialog.getByTestId(`modal-stage-${id}`)).toHaveText(/Parked/i);

  // The reporter is told it is held, not that it died.
  const held = await reporterView(page, title, me);
  expect(held.stageLabel).toBe('On hold');

  await dialog.getByRole('button', { name: /^Reopen$/ }).click();
  // Back to where it was — NOT to the front of the pipeline, which would silently re-cross
  // a gate the maintainer already passed.
  await expect(dialog.getByTestId(`modal-stage-${id}`)).toHaveText(/In progress/i);
  expect(await stageOf(page, id)).toBe('in-progress');
});

test('a reporter hears back: reply, then closure (FR-FL-036/048)', async ({ page }) => {
  const me = ownReporter();
  const title = await fileReport(page.request, me);
  const id = await idFor(page, title);
  await walkTo(page, id, ['accept', 'advance', 'advance', 'approve-spec', 'advance', 'approve-release']);

  const replied = await page.request.put(`/api/v1/admin/lifecycle/${id}/reply`, {
    data: { text: 'Thanks for this — it turned out to be a rounding bug.' },
    headers: AS_ADMIN,
  });
  expect(replied.status()).toBe(200);

  const seen = await reporterView(page, title, me);
  expect(seen.reply?.text).toContain('rounding bug');
  // Before this phase a reporter submitted into silence — nothing ever told them it was read.
  expect(seen.stageLabel).toBe('Shipped');
});

test('closed never reopens, but a later report can cite it (FR-FL-050/051)', async ({ page }) => {
  const me = ownReporter();
  const title = await fileReport(page.request, me);
  const id = await idFor(page, title);
  await walkTo(page, id, ['accept', 'advance', 'advance', 'approve-spec', 'advance', 'approve-release']);
  const closed = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
    data: { action: 'close', excerpt: 'Fixed and released.', releaseFallbackText: 'this week' },
    headers: AS_ADMIN,
  });
  expect(closed.status()).toBe(200);

  // Terminal means terminal: a wrongly-fixed problem is filed fresh, so each record describes
  // exactly one round of work rather than being edited into ambiguity.
  for (const action of ['reopen', 'advance', 'park']) {
    const r = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, { data: { action }, headers: AS_ADMIN });
    expect(r.status(), action).toBe(409);
  }
  expect(await stageOf(page, id)).toBe('closed');

  // Citing is a reference, never a transition — and it is the ONLY way a recurrence relates to
  // a closed item, so it has to work on a terminal one.
  const recurrence = await fileReport(page.request, me);
  const newId = await idFor(page, recurrence);
  const cited = await page.request.patch(`/api/v1/admin/lifecycle/${newId}`, {
    data: { action: 'cite', citedId: id },
    headers: AS_ADMIN,
  });
  expect(cited.status()).toBe(200);
  expect(await stageOf(page, newId)).toBe('new');

  const reporterSees = await reporterView(page, title, me);
  expect(reporterSees.stageLabel).toBe('Done');
  expect(reporterSees.closure?.excerpt).toBe('Fixed and released.');
});

test('a record in an active stage cannot be deleted, and the refusal says what unblocks it (FR-FL-006)', async ({
  page,
}) => {
  const me = ownReporter();
  const title = await fileReport(page.request, me);
  const id = await idFor(page, title);
  const recordId = await recordIdFor(page, id);
  await walkTo(page, id, ['accept']);

  const refused = await page.request.delete(`/api/v1/feedback/${recordId}`, { headers: me });
  expect(refused.status()).toBe(409);
  // The refusal names the action that unblocks it rather than just saying no.
  expect((await refused.text()).toLowerCase()).toMatch(/park/);

  await page.request.patch(`/api/v1/admin/lifecycle/${id}`, { data: { action: 'park' }, headers: AS_ADMIN });
  const allowed = await page.request.delete(`/api/v1/feedback/${recordId}`, { headers: me });
  expect([204, 200]).toContain(allowed.status());
});

test('each state has the reporter-facing sentence the contract promises (FR-FL-035/065)', async ({
  page,
}) => {
  const expected: Array<[string[], string]> = [
    [[], 'Waiting to be looked at'],
    [['accept'], 'Accepted — queued'],
    [['accept', 'advance'], 'Being specified'],
    [['accept', 'advance', 'advance'], 'Being specified'],
    [['accept', 'advance', 'advance', 'approve-spec'], 'Being built'],
    [['accept', 'advance', 'advance', 'approve-spec', 'advance'], 'In review'],
  ];

  for (const [actions, label] of expected) {
    const me = ownReporter();
    const title = await fileReport(page.request, me);
    const id = await idFor(page, title);
    await walkTo(page, id, actions);
    expect((await reporterView(page, title, me)).stageLabel, actions.join('→') || 'new').toBe(label);
  }

  // Dismissal's two meanings are the same terminal position but a very different sentence.
  for (const [reason, label] of [
    ['no-action-required', 'No action required'],
    ['declined', 'Not being built'],
  ] as const) {
    const me = ownReporter();
    const title = await fileReport(page.request, me);
    const id = await idFor(page, title);
    await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
      data: { action: 'dismiss', reason },
      headers: AS_ADMIN,
    });
    expect((await reporterView(page, title, me)).stageLabel, reason).toBe(label);
  }
});

test('in-progress will not advance without a pull request, and the control says so (FR-FL-067)', async ({
  page,
}) => {
  const me = ownReporter();
  const title = await fileReport(page.request, me);
  const id = await idFor(page, title);
  await walkTo(page, id, ['accept', 'advance', 'advance', 'approve-spec']);

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Delivery' }).click();
  const dialog = await openItem(page, 'Delivery', title);

  // Disabled rather than live-and-refused: the design's contract table makes this the only
  // conditional advance, so the reason belongs before the click.
  await expect(dialog.getByRole('button', { name: 'Ready for review' })).toBeDisabled();
  const refused = await page.request.patch(`/api/v1/admin/lifecycle/${id}`, {
    data: { action: 'advance' },
    headers: AS_ADMIN,
  });
  expect(refused.status()).toBe(409);
  expect(await stageOf(page, id)).toBe('in-progress');

  // Attach through the REAL control — it had none at all before, so the reference the
  // reviewer opens could only be attached by curl.
  const ref = 'https://github.com/example/fridge-planner/pull/99';
  await dialog.getByLabel(/pull request url/i).fill(ref);
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(dialog.getByLabel(/pull request url/i)).toHaveValue(ref);

  await dialog.getByRole('button', { name: 'Ready for review' }).click();
  await expect(dialog.getByTestId(`modal-stage-${id}`)).toHaveText(/In review/i);
  expect(await stageOf(page, id)).toBe('in-review');
});

test('a clause can be edited before it is accepted (FR-FL-029)', async ({ page }) => {
  const me = ownReporter();
  const title = await fileReport(page.request, me);
  const id = await idFor(page, title);
  await walkTo(page, id, ['accept', 'advance']);

  // A hand-written clause is born accepted, so seed a PENDING one the way the agent would.
  await page.request.post(`/api/v1/admin/lifecycle/${id}/clauses`, {
    data: {},
    headers: AS_ADMIN,
  });
  const before = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  const pending = ((await before.json()) as { clauses: { provisionalId: string; vetted: string }[] })
    .clauses.filter((c) => c.vetted === 'pending');
  // The stand-in agent answers the clause-drafting mode, so this is deterministic. It used to
  // `test.skip` here — which meant the test never once ran.
  expect(pending.length).toBeGreaterThan(0);

  await page.goto('/admin');
  await page.getByRole('tab', { name: 'Delivery' }).click();
  const dialog = await openItem(page, 'Delivery', title);
  const panel = dialog.locator('div[aria-label="Clause vetting"]');

  await panel.getByRole('button', { name: 'Edit' }).first().click();
  const edited = 'When a grocery row is checked off, the system shall collapse duplicates.';
  await panel.getByLabel(/edit clause/i).first().fill(edited);
  await panel.getByRole('button', { name: /Save and accept/ }).click();

  // The SERVER's answer: the maintainer's wording is stored and the clause counts as vetted.
  await expect(panel.getByText(edited)).toBeVisible();
  const after = await page.request.get(`/api/v1/admin/lifecycle/${id}`, { headers: AS_ADMIN });
  const clause = ((await after.json()) as {
    clauses: { provisionalId: string; vetted: string; editedText?: string }[];
  }).clauses.find((c) => c.provisionalId === pending[0]!.provisionalId)!;
  expect(clause.editedText).toBe(edited);
  expect(clause.vetted).toBe('accepted');
});

test('the modal is a centred dialog on a desktop-width window, not a bottom sheet (FR-RS-023)', async ({
  page,
}) => {
  // 1100px: wider than iPad landscape, narrower than the old `xl:` switch. This window used to
  // get a full-width sheet pinned across the bottom of a desktop screen.
  await page.setViewportSize({ width: 1100, height: 800 });
  const me = ownReporter();
  const title = await fileReport(page.request, me);

  await page.goto('/admin');
  const dialog = await openItem(page, 'Triage queue', title);
  await dialog.evaluate((el) =>
    Promise.all(el.getAnimations().map((a) => a.finished.catch(() => undefined))),
  );

  const box = (await dialog.boundingBox())!;
  expect(box.width, 'a dialog is inset, not full-bleed').toBeLessThan(1100);

  // BOTH axes. The first version of this test checked only the width and the top edge, so it
  // passed while the panel sat hard against the left edge — `justify-content` centres tracks,
  // and the single track already filled the scrim, so nothing centred the panel itself.
  const leftGap = box.x;
  const rightGap = 1100 - (box.x + box.width);
  expect(Math.abs(leftGap - rightGap), 'equal gaps left and right').toBeLessThanOrEqual(2);

  const topGap = box.y;
  const bottomGap = 800 - (box.y + box.height);
  expect(Math.abs(topGap - bottomGap), 'equal gaps top and bottom').toBeLessThanOrEqual(2);
});
