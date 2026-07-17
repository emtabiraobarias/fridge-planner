import { NextResponse } from 'next/server';
import { authenticate } from '@server/auth';
import { parseAssisted } from '@server/controllers/quick-add';
import { withRoute, problemResponse } from '@server/route-helpers';
import { rateLimit } from '@server/rate-limit';

// No DB access — this endpoint only consults the (cached) AI assistant.
export async function POST(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    const rl = rateLimit(`quick-add-parse:${userId}`, 20, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many parse-assist requests. Try again in a minute.');
    }
    const body: unknown = await request.json().catch(() => ({}));
    const result = await parseAssisted(body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
