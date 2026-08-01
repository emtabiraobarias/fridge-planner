import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { promoteFromFeedback } from '@server/controllers/pipeline';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

// Promotion is a maintainer action, not assistant-backed — default 100/min tier (D12).
// Spec 011 FR-AD-010: administrator-only (makes `003` FR-F-013's "maintainer" enforceable).
export async function POST(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId } = await requirePrincipalAdmin(request);
    const rl = rateLimit(`promote:${userId}`, 100, 60_000);
    if (!rl.allowed) {
      return problemResponse(
        429,
        'Rate Limit Exceeded',
        'Too many promote requests. Try again in a minute.',
      );
    }
    await connectDb();
    const { id } = await ctx.params;
    const result = await promoteFromFeedback(userId, id);
    return NextResponse.json(result.body, { status: result.status });
  });
}
