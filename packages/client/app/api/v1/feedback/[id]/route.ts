import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { deleteFeedback, getFeedback } from '@server/controllers/feedback';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { id } = await ctx.params;
    const result = await getFeedback(await authenticate(request), id);
    return NextResponse.json(result.body, { status: result.status });
  });
}

export async function DELETE(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { id } = await ctx.params;
    const result = await deleteFeedback(await authenticate(request), id);
    // 204 must carry no body.
    if (result.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json(result.body, { status: result.status });
  });
}
