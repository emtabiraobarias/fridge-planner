import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticate } from '@server/auth';
import { verifyRecipeLinks } from '@server/controllers/recommendations';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

// FR-037 lazy phase: verify recipe links for already-returned meals. No DB access —
// just the search providers (with a per-name server-side cache).
export const maxDuration = 120;

const bodySchema = z.object({
  mealNames: z.array(z.string().min(1).max(120)).min(1).max(10),
});

export async function POST(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    // More generous than the agent endpoint (10/min) — this is a cheap follow-up,
    // but still bounded to keep provider usage sane.
    const rl = rateLimit(`verify-links:${userId}`, 30, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many link-verification requests. Try again in a minute.');
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return problemResponse(400, 'Bad Request', 'Body must be { mealNames: string[] } with 1-10 names.');
    }

    const result = await verifyRecipeLinks(parsed.data.mealNames);
    return NextResponse.json(result.body, { status: result.status });
  });
}
