import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { listFeedback, startConversation } from '@server/controllers/feedback';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

// The feedback agent turn is LLM-backed; allow a longer run than a sync endpoint.
export const maxDuration = 120;

export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    await connectDb();
    const { searchParams } = new URL(request.url);
    const result = await listFeedback(userId, searchParams);
    return NextResponse.json(result.body, { status: result.status });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    // Agent-backed chat is rate-limited per user (FR-F-009), like recommendations.
    const rl = rateLimit(`feedback-chat:${userId}`, 10, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many feedback messages. Try again in a minute.');
    }
    await connectDb();
    const body: unknown = await request.json().catch(() => ({}));
    const result = await startConversation(userId, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
