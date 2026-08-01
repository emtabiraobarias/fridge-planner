import { NextResponse } from 'next/server';
import { authenticatePrincipal } from '@server/auth';
import { withRoute } from '@server/route-helpers';

/**
 * GET /api/v1/me — the caller's own identity and privilege (spec 011, US2 UI).
 *
 * Authenticated but NOT admin-guarded: every user may ask who they are; the answer
 * for an ordinary user is simply `isAdmin: false`.
 *
 * This exists instead of decoding the token in the browser (a deviation from research
 * D11, recorded there) for two reasons the client cannot work around:
 *  - the **dev seam carries no token at all** (identity is a header), so client-side
 *    decoding would be blind in local dev, tests, and the E2E gate;
 *  - the role claim path is **server-configurable** (`AUTH_ROLES_CLAIM`), so extracting
 *    it in the browser would duplicate configuration that can silently drift.
 *
 * This is a convenience for hiding UI the user cannot use. It is NOT enforcement —
 * every admin capability is guarded server-side on its own route (FR-AD-002).
 */
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId, isAdmin } = await authenticatePrincipal(request);
    return NextResponse.json({ userId, isAdmin }, { status: 200 });
  });
}
