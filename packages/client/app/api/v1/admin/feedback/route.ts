import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { adminListFeedback } from '@server/controllers/admin-feedback';
import { withRoute } from '@server/route-helpers';

// GET /api/v1/admin/feedback — cross-user triage list (spec 011 FR-AD-009).
// Administrator-only: the guard is the FIRST thing after connectDb, so privilege is
// decided on the server regardless of what any UI does or does not render (FR-AD-002).
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId } = await requirePrincipalAdmin(request);
    await connectDb();
    const result = await adminListFeedback(userId, new URL(request.url).searchParams);
    return NextResponse.json(result.body, { status: result.status });
  });
}
