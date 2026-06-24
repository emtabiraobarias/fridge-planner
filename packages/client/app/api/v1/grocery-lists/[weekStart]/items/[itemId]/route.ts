import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { getUserId } from '@server/auth';
import { patchGroceryItem, deleteGroceryItem } from '@server/controllers/grocery-lists';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ weekStart: string; itemId: string }>;
}

export async function PATCH(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { weekStart, itemId } = await ctx.params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await patchGroceryItem(getUserId(request), weekStart, itemId, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}

export async function DELETE(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { weekStart, itemId } = await ctx.params;
    const result = await deleteGroceryItem(getUserId(request), weekStart, itemId);
    return NextResponse.json(result.body, { status: result.status });
  });
}
