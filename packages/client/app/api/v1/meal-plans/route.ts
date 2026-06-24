import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { getUserId } from '@server/auth';
import { getMealPlan } from '@server/controllers/meal-plans';

export async function GET(request: Request): Promise<NextResponse> {
  await connectDb();
  const { searchParams } = new URL(request.url);
  const result = await getMealPlan(getUserId(request), searchParams.get('weekStart'));
  return NextResponse.json(result.body, { status: result.status });
}
