import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { continueConversation } from '@server/controllers/feedback';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

export const maxDuration = 120;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function POST(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    // Share the chat rate-limit budget with the start endpoint (FR-F-009).
    const rl = rateLimit(`feedback-chat:${userId}`, 10, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many feedback messages. Try again in a minute.');
    }
    await connectDb();
    const { id } = await ctx.params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await continueConversation(userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
