import { NextResponse } from 'next/server';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { inspectLimiter } from '@server/rate-limit';
import { withRoute } from '@server/route-helpers';

// GET /api/v1/admin/limits — current limiter state (FR-AD-029).
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await requirePrincipalAdmin(request);
    return NextResponse.json({ buckets: inspectLimiter() }, { status: 200 });
  });
}
