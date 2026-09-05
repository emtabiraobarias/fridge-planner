import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticatePrincipal } from '@server/auth';
import { getMe, updateDisplayName, deleteOwn } from '@server/controllers/accounts';
import { withRoute } from '@server/route-helpers';

/**
 * The caller's own account (spec 013 US2).
 *
 * Distinct from `/api/v1/me`, which stays exactly as it is: that answers "who am I and may I
 * administer" for the nav and admin gating, and 011 deliberately gave it no profile fields.
 * This adds them rather than widening a shape three surfaces already depend on.
 */
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const principal = await authenticatePrincipal(request);
    const result = await getMe(principal);
    return NextResponse.json(result.body, { status: result.status });
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const principal = await authenticatePrincipal(request);
    const body: unknown = await request.json().catch(() => ({}));
    const result = await updateDisplayName(principal, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}

/**
 * FR-AC-025. 202, not 204: the account is scheduled for deletion, not deleted — the two-phase
 * erasure keeps the data for a recovery window, and the body says how long.
 */
export async function DELETE(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await connectDb();
    const principal = await authenticatePrincipal(request);
    const result = await deleteOwn(principal);
    return NextResponse.json(result.body, { status: result.status });
  });
}
