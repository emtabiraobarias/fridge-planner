import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { addMealEntry } from '@server/controllers/meal-plans';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ weekStart: string }>;
}

export async function POST(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { weekStart } = await ctx.params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await addMealEntry(await authenticate(request), weekStart, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
