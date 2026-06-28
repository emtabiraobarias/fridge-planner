import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { addGroceryItem } from '@server/controllers/grocery-lists';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ weekStart: string }>;
}

export async function POST(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { weekStart } = await ctx.params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await addGroceryItem(await authenticate(request), weekStart, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
