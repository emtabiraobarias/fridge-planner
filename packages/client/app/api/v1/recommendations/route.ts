import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { getUserId } from '@server/auth';
import { getRecommendations } from '@server/controllers/recommendations';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

// The Holodeck agent can take a while (WebSearch/WebFetch); allow a long run.
// Effective on serverless platforms; harmless under `output: standalone` (Node).
export const maxDuration = 240;

export async function POST(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = getUserId(request);
    // Replaces the Express recommendationsLimiter (10 requests / minute).
    const rl = rateLimit(`recommendations:${userId}`, 10, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many recommendation requests. Try again in a minute.');
    }
    await connectDb();
    const result = await getRecommendations(userId);
    return NextResponse.json(result.body, { status: result.status });
  });
}
