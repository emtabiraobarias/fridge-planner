import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { updateInventory, deleteInventory } from '@server/controllers/inventory';
import { withRoute } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { id } = await ctx.params;
    const body: unknown = await request.json().catch(() => ({}));
    const result = await updateInventory(await authenticate(request), id, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}

export async function DELETE(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { id } = await ctx.params;
    const result = await deleteInventory(await authenticate(request), id);
    // 204 must carry no body.
    if (result.status === 204) return new NextResponse(null, { status: 204 });
    return NextResponse.json(result.body, { status: result.status });
  });
}
