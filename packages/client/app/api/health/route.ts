import { NextResponse } from 'next/server';

// Never cache: the point of `version` below is to report what THIS running container
// is, so a prerendered answer would defeat it.
export const dynamic = 'force-dynamic';

/**
 * Public health check (FR-D-006) — no authentication; used by Docker/compose + smoke.
 *
 * `version` is baked into the image at build time (Dockerfile `APP_VERSION`, passed by
 * deploy-nextjs.yml from the release tag) and is the only reliable way to ask a running
 * deployment which release it is serving. It exists because the spec-010 rollout stalled
 * silently: `{status:'ok'}` was returned quite happily by the OLD container for a day, and
 * the stall was noticed only because a route that happened to be net-new 404'd.
 * `scripts/verify-rollout.sh` polls this after a release so that is never a lucky catch
 * again. Falls back to 'dev' for local runs and non-release builds.
 */
export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok', version: process.env.APP_VERSION ?? 'dev' });
}
