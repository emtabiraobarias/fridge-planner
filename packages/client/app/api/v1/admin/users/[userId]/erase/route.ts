import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { adminEraseUser } from '@server/controllers/admin-accounts';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ userId: string }>;
}

// POST /api/v1/admin/users/:userId/erase — begin two-phase erasure (FR-AD-018).
// Rate-limited: destructive and scriptable, so a mistaken loop cannot run away.
export async function POST(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId: adminUserId } = await requirePrincipalAdmin(request);
    const rl = rateLimit(`admin-erase:${adminUserId}`, 10, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many erasures. Try again shortly.');
    }
    await connectDb();
    const { userId } = await ctx.params;
    const result = await adminEraseUser(adminUserId, decodeURIComponent(userId));
    return NextResponse.json(result.body, { status: result.status });
  });
}
