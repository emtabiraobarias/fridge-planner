import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { getRecommendations } from '@server/controllers/recommendations';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

// The Holodeck agent can take a while (WebSearch/WebFetch); allow a long run.
// Effective on serverless platforms; harmless under `output: standalone` (Node).
export const maxDuration = 240;

// Spec 009 (research D1 / contracts/recommendations-scoping-api.md): optional
// ingredient scope. Malformed/absent is never a 400 (preserves the "no body
// required" contract) — it simply parses to no selection.
const bodySchema = z.object({
  ingredientItemIds: z.array(z.string().min(1).max(64)).max(20).optional(),
});

export async function POST(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    // Replaces the Express recommendationsLimiter (10 requests / minute).
    const rl = rateLimit(`recommendations:${userId}`, 10, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many recommendation requests. Try again in a minute.');
    }
    // T006 (spec 009): parsed here but not yet passed to the controller — wiring
    // into getRecommendations lands in IR2 (T020/T021).
    const parsedBody = bodySchema.safeParse(await request.json().catch(() => ({})));
    void parsedBody;
    await connectDb();
    const result = await getRecommendations(userId);
    return NextResponse.json(result.body, { status: result.status });
  });
}
