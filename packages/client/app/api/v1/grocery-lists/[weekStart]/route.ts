import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { getGroceryList } from '@server/controllers/grocery-lists';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ weekStart: string }>;
}

export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { weekStart } = await ctx.params;
    const result = await getGroceryList(await authenticate(request), weekStart);
    return NextResponse.json(result.body, { status: result.status });
  });
}
