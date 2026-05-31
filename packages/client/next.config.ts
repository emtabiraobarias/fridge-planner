import type { NextConfig } from 'next';

const backendUrl = process.env['BACKEND_URL'] ?? 'http://localhost:3001';

const nextConfig: NextConfig = {
  output: 'standalone',
  // Holodeck AI calls (recommendations) can take >30s; raise the proxy ceiling to 4 min.
  experimental: {
    proxyTimeout: 240_000,
  },
  async rewrites() {
    return [{ source: '/api/:path*', destination: `${backendUrl}/api/:path*` }];
  },
};

export default nextConfig;
