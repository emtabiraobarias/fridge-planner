import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { getMealPlan } from '@server/controllers/meal-plans';
import { withRoute } from '@server/route-helpers';

export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const { searchParams } = new URL(request.url);
    const result = await getMealPlan(await authenticate(request), searchParams.get('weekStart'));
    return NextResponse.json(result.body, { status: result.status });
  });
}
