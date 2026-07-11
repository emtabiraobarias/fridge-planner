import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { exportFeedback } from '@server/controllers/feedback';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { id } = await ctx.params;
    const result = await exportFeedback(await authenticate(request), id);
    // Success → raw markdown; errors → Problem JSON.
    if (result.status === 200) {
      return new NextResponse(result.body as string, {
        status: 200,
        headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
      });
    }
    return NextResponse.json(result.body, { status: result.status });
  });
}
