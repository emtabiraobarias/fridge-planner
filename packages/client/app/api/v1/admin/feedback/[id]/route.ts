import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { adminGetFeedback } from '@server/controllers/admin-feedback';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// GET /api/v1/admin/feedback/:id — any user's record incl. transcript (FR-AD-009).
export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId } = await requirePrincipalAdmin(request);
    await connectDb();
    const { id } = await ctx.params;
    const result = await adminGetFeedback(userId, id);
    return NextResponse.json(result.body, { status: result.status });
  });
}
