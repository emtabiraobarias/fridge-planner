import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { getUserId } from '@server/auth';
import { completeGroceryList } from '@server/controllers/grocery-lists';

interface RouteContext {
  params: Promise<{ weekStart: string }>;
}

export async function POST(request: Request, ctx: RouteContext): Promise<NextResponse> {
  await connectDb();
  const { weekStart } = await ctx.params;
  const body: unknown = await request.json().catch(() => ({}));
  const result = await completeGroceryList(getUserId(request), weekStart, body);
  return NextResponse.json(result.body, { status: result.status });
}
