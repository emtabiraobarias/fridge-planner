import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { adminGetUserData } from '@server/controllers/admin-users';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ userId: string }>;
}

// GET /api/v1/admin/users/:userId/data — read-only support view (spec 011 FR-AD-015).
//
// GET is the ONLY verb this resource has. There is no PUT/PATCH/POST/DELETE handler,
// and that absence is what enforces "read-only" — not a flag, not a comment. Admin
// writes to another user's data are out of scope for spec 011.
export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId: adminUserId } = await requirePrincipalAdmin(request);
    await connectDb();
    const { userId } = await ctx.params;
    const result = await adminGetUserData(adminUserId, decodeURIComponent(userId));
    return NextResponse.json(result.body, { status: result.status });
  });
}
