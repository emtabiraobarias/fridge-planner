import type { NextConfig } from 'next';

const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Holodeck AI calls (recommendations) can take >30s; raise the proxy ceiling to 4 min.
  experimental: {
    proxyTimeout: 240_000,
  },
  // Phase C-bis migration: endpoints handled by Next.js Route Handlers are omitted
  // from this list. Everything still served by Express is proxied explicitly, so a
  // catch-all rewrite can't shadow the app-router dynamic routes (e.g. /inventory/[id]).
  // Migrated so far: inventory.
  async rewrites() {
    return [
      { source: '/api/v1/recommendations/:path*', destination: `${backendUrl}/api/v1/recommendations/:path*` },
      { source: '/api/v1/meal-plans/:path*', destination: `${backendUrl}/api/v1/meal-plans/:path*` },
      { source: '/api/v1/grocery-lists/:path*', destination: `${backendUrl}/api/v1/grocery-lists/:path*` },
    ];
  },
};

export default nextConfig;
