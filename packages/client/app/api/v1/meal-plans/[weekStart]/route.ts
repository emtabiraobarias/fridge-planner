import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { replaceMealEntries } from '@server/controllers/meal-plans';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ weekStart: string }>;
}

export async function PUT(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { weekStart } = await ctx.params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await replaceMealEntries(await authenticate(request), weekStart, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
