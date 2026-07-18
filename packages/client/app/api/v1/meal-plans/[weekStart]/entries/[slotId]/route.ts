import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { deleteMealEntry, patchMealEntry } from '@server/controllers/meal-plans';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ weekStart: string; slotId: string }>;
}

export async function DELETE(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { weekStart, slotId } = await ctx.params;
    const result = await deleteMealEntry(await authenticate(request), weekStart, slotId);
    return NextResponse.json(result.body, { status: result.status });
  });
}

// Spec 006: entry lifecycle transition — {action:'cook', consumption:[…]} | {action:'uncook'}.
export async function PATCH(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const { weekStart, slotId } = await ctx.params;
    const userId = await authenticate(request);
    const rl = rateLimit(`meal-plan-entry:${userId}`, 100, 60_000);
    if (!rl.allowed) {
      return problemResponse(429, 'Rate Limit Exceeded', 'Too many meal-plan requests. Try again in a minute.');
    }
    await connectDb();
    const body: unknown = await request.json().catch(() => null);
    const result = await patchMealEntry(userId, weekStart, slotId, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
