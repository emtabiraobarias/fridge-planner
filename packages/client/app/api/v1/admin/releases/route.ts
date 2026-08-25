import { NextResponse } from 'next/server';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { fetchReleases } from '@server/services/release-list';
import { withRoute } from '@server/route-helpers';

export const dynamic = 'force-dynamic';

// GET /api/v1/admin/releases — the closure picker's list (spec 012 D17, FR-FL-043).
//
// Returns **200 even when GitHub is unreachable**, with `available: false` and a reason.
// Unavailability is a normal answer here, not an error: FR-FL-045 forbids gating closure on a
// third party, so a 503 would push the client into an error path it must not take.
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await requirePrincipalAdmin(request);
    return NextResponse.json(await fetchReleases(), { status: 200 });
  });
}
