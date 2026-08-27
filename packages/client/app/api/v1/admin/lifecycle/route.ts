import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { listQueue, parseQueueFilters } from '@server/controllers/admin-lifecycle';
import { withRoute } from '@server/route-helpers';

// GET /api/v1/admin/lifecycle — the cross-user triage queue (spec 012 FR-FL-023).
//
// Administrator-only. An authenticated non-admin gets 403, deliberately NOT 401: the client
// treats 401 as its FR-D-010 refresh-and-retry trigger, so 401 here would loop.
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await requirePrincipalAdmin(request);
    await connectDb();
    const filters = parseQueueFilters(new URL(request.url).searchParams);
    const { status, body } = await listQueue(filters);
    return NextResponse.json(body, { status });
  });
}
