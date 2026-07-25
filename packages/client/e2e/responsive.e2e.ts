import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

/**
 * Spec 010 RS1 — the responsive shell (FR-RS-001..007, SC-RS-001/002/009).
 *
 * This spec is the ONE spec that runs on all five viewport projects
 * (playwright.config.ts): `desktop`, `phone-portrait`, `phone-landscape`,
 * `ipad-portrait`, `ipad-landscape`. Every other spec stays desktop-only, so the
 * existing suite does not multiply ×5 (research D9).
 *
 * Scope is deliberately RS1 only: navigation mode + position, the single-scroll-
 * container rule, no horizontal overflow, and the desktop sidebar's persisted
 * collapse. Day-strip-vs-grid (RS3) and overlay sheet-vs-dialog (RS6) are asserted
 * by their own phases, not here.
 */
const SHOTS = 'e2e/screenshots';
mkdirSync(SHOTS, { recursive: true });

type Mode = 'pill' | 'rail' | 'sidebar';

/** Which nav mode the current project's viewport must produce (design §2). */
function expectedMode(width: number, height: number): Mode {
  const landscape = width > height;
  if (width >= 1280) return 'sidebar';
  // phone landscape: short + landscape + < 900px  → rail (the `phland` raw query)
  if (landscape && height <= 500 && width < 900) return 'rail';
  if (width >= 1024) return 'rail'; // iPad landscape
  return 'pill'; // phone portrait, iPad portrait
}

function viewportOf(page: Page): { width: number; height: number } {
  const vp = page.viewportSize();
  if (!vp) throw new Error('no viewport size — this spec requires a fixed viewport project');
  return vp;
}

/** The nav is hydrated once it carries data-nav-ready (avoids racing the collapse read). */
async function navReady(page: Page) {
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(nav).toHaveAttribute('data-nav-ready', 'true');
  return nav;
}

const SCREENS = ['/', '/calendar', '/grocery'] as const;

test('navigation renders in the mode its viewport calls for (FR-RS-002)', async ({ page }) => {
  const { width, height } = viewportOf(page);
  const mode = expectedMode(width, height);

  await page.goto('/');
  const nav = await navReady(page);
  await expect(nav).toBeVisible();

  const box = (await nav.boundingBox())!;
  expect(box, 'nav must have a layout box').toBeTruthy();

  if (mode === 'sidebar') {
    // Persistent left sidebar: full height, docked at x≈0, and it participates in
    // layout (it is a flex sibling of <main>, not an overlay).
    expect(box.x).toBeLessThan(4);
    expect(box.height).toBeGreaterThan(height * 0.8);
    await expect(page.getByRole('button', { name: 'Toggle navigation' })).toBeVisible();
  } else if (mode === 'rail') {
    // Floating vertical rail, docked left and vertically centred, NOT full height.
    expect(box.x).toBeLessThan(width / 2);
    expect(box.height).toBeLessThan(height * 0.95);
    expect(box.height).toBeGreaterThan(box.width); // taller than wide ⇒ vertical
  } else {
    // Floating horizontal pill, bottom-centre: wider than tall, low on the screen,
    // and horizontally centred within a tolerance.
    expect(box.width).toBeGreaterThan(box.height);
    expect(box.y).toBeGreaterThan(height * 0.6);
    const navCentre = box.x + box.width / 2;
    expect(Math.abs(navCentre - width / 2)).toBeLessThan(24);
  }

  // The feedback affordance is present on every viewport (FR-RS-006) and must not
  // sit on top of the nav.
  const fb = page.getByRole('link', { name: 'Tell us — send feedback' });
  await expect(fb).toBeVisible();
  const fbBox = (await fb.boundingBox())!;
  const overlaps =
    fbBox.x < box.x + box.width &&
    fbBox.x + fbBox.width > box.x &&
    fbBox.y < box.y + box.height &&
    fbBox.y + fbBox.height > box.y;
  expect(overlaps, 'feedback affordance must not overlap the nav').toBe(false);
});

test('no screen scrolls the page horizontally (SC-RS-001)', async ({ page }) => {
  for (const path of SCREENS) {
    await page.goto(path);
    await navReady(page);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(overflow.scrollWidth, `${path} must not overflow horizontally`).toBeLessThanOrEqual(
      overflow.clientWidth,
    );
  }
});

test('only the content region scrolls; the nav never scrolls away (FR-RS-004, SC-RS-002)', async ({
  page,
}) => {
  await page.goto('/');
  const nav = await navReady(page);
  const before = (await nav.boundingBox())!;

  // The document itself must not be the scroller.
  const docScrolls = await page.evaluate(
    () => document.documentElement.scrollHeight > document.documentElement.clientHeight + 1,
  );
  expect(docScrolls, 'the document must not be the scroll container').toBe(false);

  // Scroll <main> hard; the nav must not move.
  await page.evaluate(() => {
    const main = document.querySelector('main');
    if (main) main.scrollTop = 4000;
  });
  const after = (await nav.boundingBox())!;
  expect(after.y).toBeCloseTo(before.y, 0);
  expect(after.x).toBeCloseTo(before.x, 0);
});

test('phone-landscape insets content past the rail — the phland cascade proof (FR-RS-005, D1)', async ({
  page,
}) => {
  const { width, height } = viewportOf(page);
  test.skip(
    !(width > height && height <= 500 && width < 900),
    'phone-landscape project only — proves `phland:` beats `sm:` at 844px',
  );

  await page.goto('/');
  await navReady(page);
  // 844px wide also matches `sm:` (px-[34px]); only the LAST-declared query wins,
  // so a left inset of 96px proves `phland:` is ordered after `sm:` in the output.
  const paddingLeft = await page.evaluate(() => {
    const wrapper = document.querySelector('main > div');
    return wrapper ? getComputedStyle(wrapper).paddingLeft : null;
  });
  expect(paddingLeft).toBe('96px');
  await page.screenshot({ path: `${SHOTS}/15-shell-phone-landscape.png`, fullPage: false });
});

test('desktop sidebar collapses and remembers it across a reload (FR-RS-003, SC-RS-009)', async ({
  page,
}) => {
  const { width } = viewportOf(page);
  test.skip(width < 1280, 'desktop project only — the sidebar exists at ≥1280px');

  await page.goto('/');
  const nav = await navReady(page);
  const expanded = (await nav.boundingBox())!.width;
  expect(expanded).toBeGreaterThan(200); // 250px expanded

  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect
    .poll(async () => Math.round((await nav.boundingBox())!.width))
    .toBeLessThan(120); // 76px collapsed
  await page.screenshot({ path: `${SHOTS}/16-shell-desktop-collapsed.png`, fullPage: false });

  // The preference must survive a reload (localStorage, applied on mount).
  await page.reload();
  const navAfter = await navReady(page);
  expect(Math.round((await navAfter.boundingBox())!.width)).toBeLessThan(120);

  // Restore so the shared server state doesn't leak into other specs.
  await page.getByRole('button', { name: 'Toggle navigation' }).click();
  await expect.poll(async () => Math.round((await navAfter.boundingBox())!.width)).toBeGreaterThan(200);
});
