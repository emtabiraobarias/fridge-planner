import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { adminRestoreUser } from '@server/controllers/admin-accounts';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ userId: string }>;
}

// POST /api/v1/admin/users/:userId/restore — undo inside the window; 410 after it
// (an explicit refusal, never a silent success against purged data) — FR-AD-019.
export async function POST(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId: adminUserId } = await requirePrincipalAdmin(request);
    await connectDb();
    const { userId } = await ctx.params;
    const result = await adminRestoreUser(adminUserId, decodeURIComponent(userId));
    return NextResponse.json(result.body, { status: result.status });
  });
}
