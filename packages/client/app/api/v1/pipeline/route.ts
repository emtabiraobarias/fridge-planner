import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { listPipeline } from '@server/controllers/pipeline';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

// GET /api/v1/pipeline — the maintainer's promoted records, status-view projection
// (FR-F-015). Optional `?stage=` filter.
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    const rl = rateLimit(`pipeline:${userId}`, 100, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many pipeline requests. Try again in a minute.');
    }
    await connectDb();
    const { searchParams } = new URL(request.url);
    const result = await listPipeline(userId, searchParams);
    return NextResponse.json(result.body, { status: result.status });
  });
}
