import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { getUserId } from '@server/auth';
import { getRecommendations } from '@server/controllers/recommendations';

// The Holodeck agent can take a while (WebSearch/WebFetch); allow a long run.
// Effective on serverless platforms; harmless under `output: standalone` (Node).
export const maxDuration = 240;

export async function POST(request: Request): Promise<NextResponse> {
  await connectDb();
  const result = await getRecommendations(getUserId(request));
  return NextResponse.json(result.body, { status: result.status });
}
