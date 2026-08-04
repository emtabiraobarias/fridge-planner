import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { resetLimiterKey } from '@server/rate-limit';
import { record as auditRecord } from '@server/lib/audit';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ key: string }>;
}

// DELETE /api/v1/admin/limits/:key — reset a bucket for a user throttled in error.
export async function DELETE(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId } = await requirePrincipalAdmin(request);
    await connectDb();
    const { key } = await ctx.params;
    const cleared = resetLimiterKey(decodeURIComponent(key));
    await auditRecord(userId, 'limits.reset', { type: 'limit', id: decodeURIComponent(key) });
    return NextResponse.json({ cleared }, { status: 200 });
  });
}
