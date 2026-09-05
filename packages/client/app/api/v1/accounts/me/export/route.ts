import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticatePrincipal } from '@server/auth';
import { exportOwn } from '@server/controllers/accounts';
import { withRoute } from '@server/route-helpers';

/**
 * Everything the app holds about the caller (spec 013 FR-AC-024).
 *
 * The same shape `011`'s administrator export produces — one export format, one thing to keep
 * correct when a collection is added, rather than two that can drift apart.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const principal = await authenticatePrincipal(request);
    const result = await exportOwn(principal);
    return NextResponse.json(result.body, { status: result.status });
  });
}
