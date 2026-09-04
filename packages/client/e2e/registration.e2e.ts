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
}

/** Unique per run: the mock IdP and the accounts collection both persist across a suite. */
function freshEmail(tag: string): string {
  return `${tag}-${Date.now()}-${Math.floor(Math.random() * 10_000)}@example.com`;
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
