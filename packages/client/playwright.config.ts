import { defineConfig, devices } from '@playwright/test';

/**
 * E2E for the Organic UI redesign (spec 004 / Phase G) and the spec-010 responsive
 * redesign. Drives the screens against a real Next build + in-memory Mongo, and
 * captures a screenshot per screen (SC-UI-006). Run: `npm run test:e2e`
 * (requires `next build` first — see the `test:e2e` script).
 *
 * Spec 010 (research D9): `responsive.e2e.ts` runs on all FIVE viewport projects;
 * every other spec runs ONLY on `desktop`. Without that split, the existing 22
 * tests would multiply ×5 — slower and mostly meaningless, since they assert
 * behaviour, not layout. `testIgnore`/`testMatch` per project enforces it.
 */
const PORT = process.env.E2E_PORT ?? '3100';

/** The five spec-010 viewport classes (design/responsive-system.md §1.1). */
const RESPONSIVE_SPEC = '**/responsive.e2e.ts';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    // Every pre-existing spec, desktop only (named `chromium` historically; kept as
    // `desktop` here and given the responsive spec to run too, at ≥1280px).
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } },
    },
    // The four touch classes run ONLY the responsive spec.
    {
      name: 'phone-portrait',
      testMatch: RESPONSIVE_SPEC,
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 }, hasTouch: true },
    },
    {
      name: 'phone-landscape',
      testMatch: RESPONSIVE_SPEC,
      use: { ...devices['Desktop Chrome'], viewport: { width: 844, height: 390 }, hasTouch: true },
    },
    {
      name: 'ipad-portrait',
      testMatch: RESPONSIVE_SPEC,
      use: { ...devices['Desktop Chrome'], viewport: { width: 834, height: 1112 }, hasTouch: true },
    },
    {
      name: 'ipad-landscape',
      testMatch: RESPONSIVE_SPEC,
      use: { ...devices['Desktop Chrome'], viewport: { width: 1194, height: 834 }, hasTouch: true },
    },
  ],
  webServer: {
    command: 'node e2e/start-server.mjs',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
