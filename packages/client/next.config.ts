import type { NextConfig } from 'next';

// Phase C-bis: every /api/v1/* endpoint is now served by Next.js Route Handlers
// (inventory, grocery-lists, meal-plans, recommendations), so the Express proxy
// rewrites are gone. Express still runs as a separate process until Cb5 removes it
// from the dev script + docker-compose.
const nextConfig: NextConfig = {
  output: 'standalone',
  // E2E isolation: `npm run test:e2e` builds with NEXT_DIST_DIR=.next-e2e so the
  // production build can't clobber the .next a running dev server is serving from
  // (that corruption manifests as "Cannot find module './vendor-chunks/<pkg>.js'").
  distDir: process.env['NEXT_DIST_DIR'] ?? '.next',
};

export default nextConfig;
