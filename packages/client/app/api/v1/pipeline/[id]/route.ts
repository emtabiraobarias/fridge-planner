import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { getPipelineItem } from '@server/controllers/pipeline';
import { rateLimit } from '@server/rate-limit';
import { withRoute, problemResponse } from '@server/route-helpers';

interface RouteContext {
  params: Promise<{ id: string }>;
}

const RATE_LIMITED = (userId: string): NextResponse | null => {
  const rl = rateLimit(`pipeline:${userId}`, 100, 60_000);
  if (rl.allowed) return null;
  return problemResponse(
    429,
    'Rate Limit Exceeded',
    'Too many pipeline requests. Try again in a minute.',
  );
};

// GET /api/v1/pipeline/:id — full item incl. transitions log (FR-F-014).
export async function GET(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const userId = await authenticate(request);
    const limited = RATE_LIMITED(userId);
    if (limited) return limited;
    await connectDb();
    const { id } = await ctx.params;
    const result = await getPipelineItem(userId, id);
    return NextResponse.json(result.body, { status: result.status });
  });
}

// PATCH /api/v1/pipeline/:id — ⚠️ DEPRECATED AND REFUSED (spec 012, task T066).
//
// Stage transitions moved to `PATCH /api/v1/admin/lifecycle/:id`, which owns the stage graph.
// This handler cannot simply forward: the old action set assumed `approved → in-spec →
// in-review → shipped`, and the new model inserts `briefed` and `in-progress` between them, so
// the same action name means a different destination. Silently doing something ADJACENT to what
// a caller asked would be worse than refusing.
//
// It refuses with 410 Gone rather than 404: the resource existed and the caller is not wrong to
// know about it — they are out of date, and the body says where it went.
//
// The admin guard runs FIRST and is deliberately kept, so a non-administrator still gets 403
// (spec 011 FR-AD-011). Losing that would weaken a refusal that is asserted in the e2e suite.
export async function PATCH(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    await requirePrincipalAdmin(request);
    const { id } = await ctx.params;
    return NextResponse.json(
      {
        type: 'https://fridge-planner.dev/errors/gone',
        title: 'Endpoint Retired',
        status: 410,
        detail:
          'Pipeline transitions moved to PATCH /api/v1/admin/lifecycle/:id (spec 012). The ' +
          'stage model changed, so this endpoint cannot forward the request safely.',
        instance: `/api/v1/admin/lifecycle/${id}`,
      },
      { status: 410, headers: { 'Content-Type': 'application/problem+json' } },
    );
  });
}
