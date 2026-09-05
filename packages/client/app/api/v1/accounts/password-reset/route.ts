import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requestPasswordReset } from '@server/controllers/accounts';
import { withRoute, problemResponse } from '@server/route-helpers';
import { rateLimit } from '@server/rate-limit';
import { sourceAddress } from '@server/request-source';

/**
 * Password reset (spec 013 US2, FR-AC-022/023/033).
 *
 * Signed out by design — someone who cannot sign in is the entire audience — so there is no
 * `authenticate()` call here, and the limiter keys on the source address (research R7).
 *
 * A SEPARATE bucket from registration, at a different limit. The abuse shapes differ:
 * registration creates provider-side state and sends mail, reset only mails an address that
 * already exists. Sharing a bucket would let one throttle the other and make both fiction.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const rl = rateLimit(`password-reset:${sourceAddress(request)}`, 10, 60_000);
    if (!rl.allowed) {
      return problemResponse(
        429,
        'Rate Limit Exceeded',
        'Too many password reset requests. Try again in a minute.',
      );
    }

    await connectDb();
    const body: unknown = await request.json().catch(() => ({}));
    const result = await requestPasswordReset(body);
    // 202 with NO body, always. `NextResponse.json(null)` would still write "null", which is
    // a body two callers could compare — the identical-response guarantee is easier to keep
    // when there is nothing to differ.
    return new NextResponse(null, { status: result.status });
  });
}
