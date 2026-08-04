import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { AiUsageCounter } from '@server/models/ai-usage-counter';
import { withRoute } from '@server/route-helpers';

// GET /api/v1/admin/usage — per-day, per-feature model-call counts (FR-AD-027).
// Counts, not cost: enough to notice a spend anomaly, without inventing a number
// precise enough to be trusted and wrong enough to mislead.
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await requirePrincipalAdmin(request);
    await connectDb();
    const q = new URL(request.url).searchParams;
    const filter: Record<string, unknown> = {};
    const from = q.get('from');
    const to = q.get('to');
    if (from || to) {
      filter['day'] = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    }
    const usage = await AiUsageCounter.find(filter).sort({ day: -1, feature: 1 }).limit(200).lean();
    return NextResponse.json({ usage }, { status: 200 });
  });
}
