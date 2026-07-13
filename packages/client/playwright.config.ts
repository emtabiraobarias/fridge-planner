import { defineConfig, devices } from '@playwright/test';

/**
 * E2E for the Organic UI redesign (spec 004 / Phase G).
 * Drives all four redesigned screens against a real Next build + in-memory Mongo,
 * and captures a screenshot per screen (SC-UI-006). Run: `npm run test:e2e`
 * (requires `next build` first — see the `test:e2e` script).
 */
const PORT = process.env.E2E_PORT ?? '3100';

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
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node e2e/start-server.mjs',
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
