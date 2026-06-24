import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { getUserId } from '@server/auth';
import { getGroceryList } from '@server/controllers/grocery-lists';

interface RouteContext {
  params: Promise<{ weekStart: string }>;
}

export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
  await connectDb();
  const { weekStart } = await ctx.params;
  const result = await getGroceryList(getUserId(request), weekStart);
  return NextResponse.json(result.body, { status: result.status });
}
