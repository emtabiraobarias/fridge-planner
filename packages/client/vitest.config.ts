import { fileURLToPath } from 'node:url';
import { defineConfig, configDefaults } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirror the tsconfig "@server/*" path so route-handler imports resolve under Vitest.
      '@server': fileURLToPath(new URL('./src/server', import.meta.url)),
      // `server-only` has no plain-Node export; stub it for node-env server tests.
      'server-only': fileURLToPath(new URL('./tests/stubs/server-only.ts', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    // Playwright specs under e2e/ are driven by playwright.config.ts, not Vitest.
    exclude: [...configDefaults.exclude, 'e2e/**'],
    // Every `tests/server/**` suite spins up `mongodb-memory-server` in `beforeAll`.
    // Whichever suite happens to sort FIRST pays mongod's cold start (binary resolve
    // + boot), which exceeds Vitest's 10s default hook timeout on a cold CI runner —
    // a latent flake that has always been one filename away, and that surfaced when
    // `admin-authorization.test.ts` became the alphabetically-first server suite.
    // Raised globally rather than per-file so the next new suite cannot re-trip it.
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'app/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.d.ts',
        'src/services/**/*.ts',
        'app/layout.tsx',
      ],
      thresholds: {
        branches: 70,
        functions: 70,
        lines: 70,
        statements: 70,
      },
    },
  },
});
