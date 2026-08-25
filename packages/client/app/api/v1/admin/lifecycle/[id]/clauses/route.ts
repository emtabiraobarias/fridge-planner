import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { addManualClause, draftClausesFor, manualClauseSchema } from '@server/controllers/lifecycle';
import { rateLimit } from '@server/rate-limit';
import { withRoute } from '@server/route-helpers';
import { LifecycleItem } from '@server/models/lifecycle-item';

interface Ctx {
  params: Promise<{ id: string }>;
}

export const maxDuration = 120;

// GET — the drafted clauses, each beside the record text it came from (FR-FL-025).
export async function GET(request: Request, ctx: Ctx): Promise<NextResponse> {
  return withRoute(async () => {
    await requirePrincipalAdmin(request);
    await connectDb();
    const { id } = await ctx.params;
    const item = await LifecycleItem.findById(id).select('clauses').lean();
    if (!item) return NextResponse.json({ clauses: [] }, { status: 404 });
    return NextResponse.json({ clauses: item.clauses }, { status: 200 });
  });
}

// POST — draft (agent-backed), or author one by hand when drafting yields nothing (FR-FL-031).
export async function POST(request: Request, ctx: Ctx): Promise<NextResponse> {
  return withRoute(async () => {
    const principal = await requirePrincipalAdmin(request);
    await connectDb();
    const { id } = await ctx.params;

    const body = await request.json().catch(() => ({}));
    const manual = manualClauseSchema.safeParse(body);
    if (manual.success) {
      const { status, body: out } = await addManualClause(id, principal.userId, manual.data);
      return NextResponse.json(out, { status });
    }

    // Agent-backed, so it shares the existing chat bucket deliberately: clause drafting must
    // not be a way around the feedback chat's 10/min limit.
    rateLimit(`feedback-chat:${principal.userId}`, 10, 60_000);
    const { status, body: out } = await draftClausesFor(id, principal.userId);
    return NextResponse.json(out, { status });
  });
}
