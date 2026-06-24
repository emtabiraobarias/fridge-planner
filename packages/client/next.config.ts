import type { NextConfig } from 'next';

// Phase C-bis: every /api/v1/* endpoint is now served by Next.js Route Handlers
// (inventory, grocery-lists, meal-plans, recommendations), so the Express proxy
// rewrites are gone. Express still runs as a separate process until Cb5 removes it
// from the dev script + docker-compose.
const nextConfig: NextConfig = {
  output: 'standalone',
};

export default nextConfig;
