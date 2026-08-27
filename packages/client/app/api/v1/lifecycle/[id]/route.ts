import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { getOwn } from '@server/controllers/lifecycle';
import { withRoute } from '@server/route-helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/v1/lifecycle/:id — one of the caller's own items.
//
// Another reporter's id yields 404, never 403: a 403 would confirm the item exists, which is
// itself a disclosure between reporters (D1).
export async function GET(request: Request, ctx: Ctx): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    await connectDb();
    const { id } = await ctx.params;
    const { status, body } = await getOwn(userId, id);
    return NextResponse.json(body, { status });
  });
}
