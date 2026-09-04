import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { register } from '@server/controllers/accounts';
import { withRoute, problemResponse } from '@server/route-helpers';
import { rateLimit } from '@server/rate-limit';
import { sourceAddress } from '@server/request-source';

/**
 * Registration is a SIGNED-OUT endpoint — the only kind in the app besides health
 * (FR-AC-029). There is no `authenticate()` call here, and that absence is the requirement:
 * a person without an account cannot present a token.
 */
export async function POST(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    // Keyed on the source address, not the submitted email: an attacker varies the email
    // freely, and a global key would let one attacker lock every visitor out (research R7).
    const rl = rateLimit(`register:${sourceAddress(request)}`, 5, 60_000);
    if (!rl.allowed) {
      return problemResponse(
        429,
        'Rate Limit Exceeded',
        'Too many registration attempts. Try again in a minute.',
      );
    }

    await connectDb();
    const issuer = process.env['AUTH_ISSUER'];
    if (!issuer) {
      // Without it the recorded pair cannot match the one `authenticate()` builds from a real
      // token, and the new account would be unreachable the moment it was created.
      return problemResponse(
        503,
        'Registration Unavailable',
        'Account registration is not configured on this deployment.',
      );
    }

    const body: unknown = await request.json().catch(() => ({}));
    const result = await register(body, issuer);
    return NextResponse.json(result.body, { status: result.status });
  });
}
