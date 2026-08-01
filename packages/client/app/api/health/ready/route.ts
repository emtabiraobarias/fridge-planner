import { NextResponse } from 'next/server';
import { readiness } from '@server/lib/health-checks';

export const dynamic = 'force-dynamic';

/**
 * GET /api/health/ready — readiness (spec 011 FR-AD-022/024/025).
 *
 * A SIBLING of `/api/health`, never a replacement. `/api/health` is liveness and stays
 * byte-identical: it has three shipped consumers (the Docker healthcheck,
 * `scripts/verify-rollout.sh`, and the smoke gate), and coupling container liveness to
 * Mongo plus two agents would let a transient blip trigger a restart loop.
 *
 * Unauthenticated like its sibling, so it reports coarse per-dependency status only.
 * 503 when not ready, so a probe can use the status code while a human reads the body.
 */
export async function GET(): Promise<NextResponse> {
  const report = await readiness();
  return NextResponse.json(report, { status: report.ready ? 200 : 503 });
}
