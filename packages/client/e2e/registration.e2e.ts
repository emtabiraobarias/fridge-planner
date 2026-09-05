import { test, expect, type Page } from '@playwright/test';

/**
 * Spec 013 US1 — self-registration in a real browser.
 *
 * §8: an e2e that only calls `page.request` proves the server works, never that anyone can
 * REACH it. `011` shipped in 4.12.0 with three panels unbuilt, every server test passing and
 * the smoke gate green, because nothing clicked the button. So this drives the real form and
 * then asserts the SERVER's answer changed.
 *
 * The e2e gate boots with the dev auth seam, which identifies every request as `anonymous` —
 * so the app is permanently "signed in" and the signed-out surface is unreachable by default.
 * Each test intercepts `/api/v1/me` to answer 401, which is what a visitor with no account
 * actually gets. That mocks the CLIENT's view of identity only: the registration POST below
 * still travels to the real route, the real controller and the real database.
 */

/** Make the browser look like a visitor who has no account. */
async function asSignedOutVisitor(page: Page): Promise<void> {
  await page.route('**/api/v1/me', (route) => route.fulfill({ status: 401, body: '{}' }));
  await fromOwnSourceAddress(page);
}

/** Unique per run: the mock IdP and the accounts collection both persist across a suite. */
function freshEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
}

/**
 * A distinct source address per test.
 *
 * Registration is limited to 5/min per source (FR-AC-018) and every request in this suite
 * arrives from the same loopback address, so without this the sixth registration in the file
 * gets a 429 and the test reads it as a broken form. Found exactly that way — the failure
 * surfaced as "no profile panel", one test after the real cause.
 *
 * This is not a workaround around the limit: it drives the SAME keying production uses,
 * which is the forwarded header Caddy sets as the only ingress (see `request-source.ts`).
 */
let sourceCounter = 0;
async function fromOwnSourceAddress(page: Page): Promise<void> {
  sourceCounter += 1;
  await page.setExtraHTTPHeaders({ 'x-forwarded-for': `198.51.100.${sourceCounter % 250}` });
}

async function fillRegistration(
  page: Page,
  email: string,
  password = 'correct-horse-battery-staple',
): Promise<void> {
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/display name/i).fill('Ada');
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /create account/i }).click();
}

test('a signed-out visitor reaches registration from Home, without a failed request first (FR-AC-029)', async ({
  page,
}) => {
  await asSignedOutVisitor(page);
  await page.goto('/home');

  // The entry point has to be ON the surface a signed-out person lands on. `/account` could
  // exist and be perfectly correct while remaining unreachable by exactly the people it is
  // for — which is the failure FR-AC-029 names.
  const panel = page.getByRole('main').getByTestId('account-panel');
  await expect(panel.getByTestId('account-register-link')).toBeVisible();
  await panel.getByTestId('account-register-link').click();

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByTestId('register-form')).toBeVisible();
  await expect(page.getByTestId('password-reset-link')).toBeVisible();
});

test('registering creates the account and asks the person to verify (FR-AC-012/013/014)', async ({
  page,
}) => {
  await asSignedOutVisitor(page);
  await page.goto('/account');
  await fillRegistration(page, freshEmail('new-user'));

  // NOT a signed-in state: registration deliberately does not produce a session, so a success
  // screen that looked like sign-in would leave someone clicking around a signed-out app.
  await expect(page.getByTestId('register-verify-notice')).toBeVisible();
  await expect(page.getByTestId('register-verify-notice')).toContainText(/verif/i);
});

test('a second registration of the same address is refused WITHOUT confirming it exists (FR-AC-016)', async ({
  page,
}) => {
  const email = freshEmail('duplicate');
  await asSignedOutVisitor(page);

  await page.goto('/account');
  await fillRegistration(page, email);
  await expect(page.getByTestId('register-verify-notice')).toBeVisible();

  // Reload and register the SAME address again. The refusal proves the first registration
  // actually persisted server-side — the assertion that a mocked fetch could not make.
  await page.goto('/account');
  await fillRegistration(page, email);

  // Scoped to the form's OWN error, not a bare `role="alert"`. A signed-out visitor's
  // `/api/v1/me` legitimately 401s, so AuthBanner's "session expired" alert is on the page
  // too — matching both is a strict-mode violation, and matching the wrong one would assert
  // nothing about registration at all.
  const alert = page.getByTestId('register-error');
  await expect(alert).toBeVisible();
  // The requirement is about what the response reveals, not its status code. An error saying
  // "that email is already registered" is an account-enumeration oracle: anyone could
  // discover who has an account here by submitting addresses.
  await expect(alert).not.toContainText(/already regist/i);
  await expect(alert).not.toContainText(/already exist/i);
  await expect(alert).not.toContainText(/taken|in use/i);
});

test('a password the provider rejects comes back with its stated reason (FR-AC-017)', async ({
  page,
}) => {
  await asSignedOutVisitor(page);
  await page.goto('/account');
  // The mock IdP refuses any password containing "weak", the way a real realm refuses one
  // that fails its policy.
  await fillRegistration(page, freshEmail('weak-password'), 'weak');

  // Without the reason, someone retypes a password with no idea what is wrong with it.
  await expect(page.getByTestId('register-error')).toContainText(/minimum length 12/i);
  await expect(page.getByTestId('register-form')).toBeVisible();
});

test('the account surface did not become a fifth navigation destination (FR-AC-028)', async ({
  page,
}) => {
  // Inherited from `002` FR-D-017. That navigation is a four-item layout tuned across five
  // viewport classes and has already shipped clipping defects under this exact pressure.
  await page.goto('/home');
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav.getByRole('link', { name: /^account$/i })).toHaveCount(0);
});

/**
 * Spec 013 US2 — managing your own account, in a real browser.
 *
 * Seeding is the awkward part and worth stating. The e2e gate runs the DEV auth seam, which
 * takes the caller's identity straight from `x-user-id` — so under it `userId` IS the internal
 * identifier, with no token to resolve. A test therefore registers through the real form,
 * takes the `accountId` the server returns, and opens a context that identifies as it. That is
 * the same identity the app would resolve from a real token, arrived at the short way.
 *
 * Every assertion below is still on the SERVER's answer: the rename is checked after a
 * reload, because a purely local state update would satisfy any check made before one.
 */
test.describe('US2 — manage your own account', () => {
  /**
   * Register through the real form and return a context that IS that account.
   * `page.request` would have been shorter and would have proved nothing about the form.
   */
  async function signedInAsNewAccount(browser: Parameters<Parameters<typeof test>[1]>[0]['browser']) {
    const setupCtx = await browser.newContext();
    const setupPage = await setupCtx.newPage();
    await asSignedOutVisitor(setupPage);

    const created = setupPage.waitForResponse(
      (r) => r.url().includes('/api/v1/accounts/register') && r.status() === 201,
    );
    await setupPage.goto('/account');
    await fillRegistration(setupPage, freshEmail('us2'));
    const { accountId } = (await (await created).json()) as { accountId: string };
    await expect(setupPage.getByTestId('register-verify-notice')).toBeVisible();
    await setupCtx.close();

    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-user-id': accountId } });
    return { ctx, page: await ctx.newPage() };
  }

  test('a signed-in user sees their profile and can rename themselves (FR-AC-021)', async ({
    browser,
  }) => {
    const { ctx, page } = await signedInAsNewAccount(browser);
    await page.goto('/account');

    const panel = page.getByTestId('profile-panel');
    await expect(panel).toBeVisible();

    await panel.getByLabel(/display name/i).fill('Ada Lovelace');
    await panel.getByRole('button', { name: /save display name/i }).click();
    await expect(panel.getByRole('button', { name: /saved/i })).toBeVisible();

    // The assertion that matters: it survives a reload, so the SERVER holds it. Checking the
    // button text alone would pass on a purely local state change.
    await page.reload();
    await expect(page.getByTestId('profile-panel').getByLabel(/display name/i)).toHaveValue(
      'Ada Lovelace',
    );
    await ctx.close();
  });

  test('the profile offers no way to change the email address (FR-AC-034/035)', async ({
    browser,
  }) => {
    // The absence IS the requirement: the stored address is what FR-AC-008 matches on when a
    // new provider appears, so a self-service edit would let someone re-point their identity
    // at an address they have not proved they own.
    const { ctx, page } = await signedInAsNewAccount(browser);
    await page.goto('/account');
    const panel = page.getByTestId('profile-panel');
    await expect(panel.getByTestId('profile-email')).toBeVisible();
    await expect(panel.getByRole('textbox', { name: /email/i })).toHaveCount(0);
    await ctx.close();
  });

  test('a password reset is started without the app ever taking a password (FR-AC-033)', async ({
    browser,
  }) => {
    const { ctx, page } = await signedInAsNewAccount(browser);
    await page.goto('/account');

    const panel = page.getByTestId('profile-panel');
    const reset = page.waitForResponse(
      (r) => r.url().includes('/api/v1/accounts/password-reset') && r.request().method() === 'POST',
    );
    await panel.getByTestId('profile-reset-button').click();

    // 202 from the real route — the provider mails and hosts the form from here.
    expect((await reset).status()).toBe(202);
    await expect(panel.getByTestId('profile-reset-sent')).toBeVisible();
    // Nothing on this surface ever asked for one.
    await expect(page.getByLabel(/password/i)).toHaveCount(0);
    await ctx.close();
  });
});

/**
 * Spec 013 US3 — exporting and deleting your own data, in a real browser.
 *
 * The delete assertions are the ones that only a browser can make: the two-step confirmation
 * is a UI property, and "access stops immediately" is only true if the SERVER refuses the
 * next request — which is what a reload proves and a mocked fetch never could.
 */
test.describe('US3 — export and delete your own data', () => {
  async function signedInAsNewAccount(browser: Parameters<Parameters<typeof test>[1]>[0]['browser']) {
    const setupCtx = await browser.newContext();
    const setupPage = await setupCtx.newPage();
    await asSignedOutVisitor(setupPage);
    const created = setupPage.waitForResponse(
      (r) => r.url().includes('/api/v1/accounts/register') && r.status() === 201,
    );
    await setupPage.goto('/account');
    await fillRegistration(setupPage, freshEmail('us3'));
    const { accountId } = (await (await created).json()) as { accountId: string };
    await expect(setupPage.getByTestId('register-verify-notice')).toBeVisible();
    await setupCtx.close();

    const ctx = await browser.newContext({ extraHTTPHeaders: { 'x-user-id': accountId } });
    return { ctx, page: await ctx.newPage(), accountId };
  }

  test('the export covers every store the app keys to the caller (FR-AC-024)', async ({
    browser,
  }) => {
    const { ctx, page, accountId } = await signedInAsNewAccount(browser);
    await page.goto('/account');

    const exported = page.waitForResponse((r) => r.url().includes('/accounts/me/export'));
    await page.getByTestId('export-button').click();

    const body = (await (await exported).json()) as {
      userId: string;
      collections: string[];
      data: Record<string, unknown[]>;
    };
    expect(body.userId).toBe(accountId);
    // The manifest and the contents have to agree — an export naming a collection it does not
    // carry under-reports what is held, which is the opposite of the point.
    for (const name of body.collections) expect(body.data[name]).toBeDefined();
    expect(body.collections).toContain('account');
    await ctx.close();
  });

  test('deleting takes two steps and then actually stops access (FR-AC-025)', async ({
    browser,
  }) => {
    const { ctx, page } = await signedInAsNewAccount(browser);
    await page.goto('/account');

    // One click arms it; nothing has been sent yet. A single misplaced tap must not start
    // the largest destructive action in the app.
    await page.getByTestId('delete-button').click();
    await expect(page.getByTestId('delete-confirm')).toBeVisible();

    const deleted = page.waitForResponse(
      (r) => r.url().endsWith('/api/v1/accounts/me') && r.request().method() === 'DELETE',
    );
    await page.getByTestId('delete-confirm-button').click();
    expect((await deleted).status()).toBe(202);

    // SCHEDULED, not gone — the recovery window is the difference, and telling someone their
    // data is destroyed when it is restorable would stop them asking for it back.
    await expect(page.getByTestId('account-deleted-notice')).toContainText(/scheduled/i);

    // The assertion a mocked fetch could never make: the SERVER refuses the very next
    // request, because the refusal lives in `authenticate()`.
    const after = await page.request.get('/api/v1/accounts/me');
    expect(after.status()).toBe(401);
    await ctx.close();
  });
});
