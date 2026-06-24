import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { getUserId } from '@server/auth';
import { listInventory, createInventory } from '@server/controllers/inventory';
import { withRoute } from '@server/route-helpers';

export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { searchParams } = new URL(request.url);
    const result = await listInventory(getUserId(request), searchParams);
    return NextResponse.json(result.body, { status: result.status });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const body: unknown = await request.json().catch(() => ({}));
    const result = await createInventory(getUserId(request), body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
