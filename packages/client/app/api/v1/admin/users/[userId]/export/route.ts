import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { adminExportUser } from '@server/controllers/admin-accounts';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ userId: string }>;
}

// GET /api/v1/admin/users/:userId/export — everything held about a user (FR-AD-017).
export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId: adminUserId } = await requirePrincipalAdmin(request);
    await connectDb();
    const { userId } = await ctx.params;
    const result = await adminExportUser(adminUserId, decodeURIComponent(userId));
    return NextResponse.json(result.body, { status: result.status });
  });
}
