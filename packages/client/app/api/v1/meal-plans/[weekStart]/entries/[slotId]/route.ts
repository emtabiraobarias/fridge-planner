import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { getUserId } from '@server/auth';
import { deleteMealEntry } from '@server/controllers/meal-plans';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ weekStart: string; slotId: string }>;
}

export async function DELETE(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { weekStart, slotId } = await ctx.params;
    const result = await deleteMealEntry(getUserId(request), weekStart, slotId);
    return NextResponse.json(result.body, { status: result.status });
  });
}
