import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { listOwn } from '@server/controllers/lifecycle';
import { withRoute } from '@server/route-helpers';

// GET /api/v1/lifecycle — the reporter's OWN items (spec 012 US2, FR-FL-034/038).
//
// `authenticate()` only, NOT the admin guard: seeing where your own report stands is the whole
// return a reporter gets, and D1's isolation is enforced by the userId-scoped query below.
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    await connectDb();
    const { status, body } = await listOwn(userId);
    return NextResponse.json(body, { status });
  });
}
