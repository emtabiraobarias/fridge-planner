import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { adminPurgeExpired } from '@server/controllers/admin-accounts';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

// POST /api/v1/admin/users/purge — purge every erasure past its window (FR-AD-018).
// The app has no scheduler (research D7), so this is the explicit trigger; the
// accounts screens also call it opportunistically.
export async function POST(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId } = await requirePrincipalAdmin(request);
    const rl = rateLimit(`admin-purge:${userId}`, 10, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many purge runs. Try again shortly.');
    }
    await connectDb();
    const result = await adminPurgeExpired(userId);
    return NextResponse.json(result.body, { status: result.status });
  });
}
