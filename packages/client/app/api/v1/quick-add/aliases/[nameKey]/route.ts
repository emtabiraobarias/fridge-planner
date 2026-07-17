import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { upsertAlias } from '@server/controllers/quick-add';
import { withRoute, problemResponse } from '@server/route-helpers';
import { rateLimit } from '@server/rate-limit';

interface RouteContext {
  params: Promise<{ nameKey: string }>;
}

export async function PUT(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    const rl = rateLimit(`quick-add-aliases:${userId}`, 100, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many alias requests. Try again in a minute.');
    }
    await connectDb();
    const { nameKey } = await ctx.params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await upsertAlias(userId, nameKey, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
