import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { authenticate } from '@server/auth';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { getPipelineItem, transitionPipelineItem } from '@server/controllers/pipeline';
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

// PATCH /api/v1/pipeline/:id — human-gated transition (action-union, FR-F-014/016/017).
// Spec 011 FR-AD-011: stage transitions AND both gate approvals are administrator-only,
// so no end user can advance their own record — least of all to `shipped` (SC-AD-003).
export async function PATCH(request: Request, ctx: RouteContext): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId } = await requirePrincipalAdmin(request);
    const limited = RATE_LIMITED(userId);
    if (limited) return limited;
    await connectDb();
    const { id } = await ctx.params;
    const body: unknown = await request.json().catch(() => null);
    const result = await transitionPipelineItem(userId, id, body);
    return NextResponse.json(result.body, { status: result.status });
  });
}
