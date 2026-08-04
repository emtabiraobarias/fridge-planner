import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { invalidateAll, invalidateUser } from '@server/services/recommendations-cache';
import { record as auditRecord } from '@server/lib/audit';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

// DELETE /api/v1/admin/cache[?userId=] — flush cached AI results (FR-AD-028).
// Rate-limited: destructive-ish and scriptable, so a mistaken loop cannot hammer it.
export async function DELETE(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId: adminUserId } = await requirePrincipalAdmin(request);
    const rl = rateLimit(`admin-cache:${adminUserId}`, 30, 60_000);
    if (!rl.allowed) {
      return problemResponse(
        429,
        'Rate Limit Exceeded',
        'Too many cache flushes. Try again shortly.',
      );
    }
    await connectDb();

    const target = new URL(request.url).searchParams.get('userId');
    if (target) invalidateUser(target);
    else invalidateAll();

    await auditRecord(adminUserId, 'cache.flush', {
      type: 'cache',
      ...(target ? { userId: target } : {}),
    });
    return NextResponse.json({ flushed: target ?? 'all' }, { status: 200 });
  });
}
