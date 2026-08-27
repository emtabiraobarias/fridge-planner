import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { withRoute } from '@server/route-helpers';
import { LifecycleItem } from '@server/models/lifecycle-item';
import { FeedbackRecord } from '@server/models/feedback-record';
import { renderFeedbackMarkdown } from '@server/lib/feedback-export';

interface Ctx {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/v1/admin/lifecycle/:id/brief — the assembled brief (FR-FL-032).
 *
 * **Content a human runs. The system never executes it** (FR-FL-033, D3): there is no job
 * runner here, no scheduler, and no agent holding repository credentials — this endpoint
 * returns markdown and stops.
 */
export async function GET(request: Request, ctx: Ctx): Promise<NextResponse> {
  return withRoute(async () => {
    await requirePrincipalAdmin(request);
    await connectDb();
    const { id } = await ctx.params;

    const item = await LifecycleItem.findById(id).lean();
    if (!item) {
      return NextResponse.json(
        {
          type: 'https://fridge-planner.dev/errors/not-found',
          title: 'Not Found',
          status: 404,
          detail: 'No such lifecycle item.',
        },
        { status: 404, headers: { 'Content-Type': 'application/problem+json' } },
      );
    }

    const record = await FeedbackRecord.findById(item.feedbackRecordId).lean();
    // The record's own markdown, then the clauses the maintainer actually accepted. Rejected
    // ones are deliberately omitted — the brief carries what was vetted IN, not everything
    // that was ever proposed.
    const accepted = item.clauses.filter((c) => c.vetted === 'accepted');
    const clauseBlock = accepted.length
      ? [
          '',
          '## Requirements (EARS, vetted)',
          '',
          ...accepted.map((c) => `- **${c.provisionalId}**: ${c.editedText ?? c.text}`),
          '',
          '> Provisional identifiers. They become real `FR-` numbers only when',
          '> `/speckit.specify` promotes them.',
        ].join('\n')
      : '\n_No vetted clauses yet._\n';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- lean() loses the doc type
    const body = (record ? renderFeedbackMarkdown(record as any) : `# ${item.sourceTitle}\n`) + clauseBlock;

    return new NextResponse(body, {
      status: 200,
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  });
}
