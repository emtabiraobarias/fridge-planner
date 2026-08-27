import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { vetClause, vetSchema } from '@server/controllers/lifecycle';
import { withRoute } from '@server/route-helpers';

interface Ctx {
  params: Promise<{ id: string; provisionalId: string }>;
}

// PATCH — vet one clause (FR-FL-029). Vetting is a comparison against the record's own words,
// not a proofread: well-formed EARS is easy to accept uncritically.
export async function PATCH(request: Request, ctx: Ctx): Promise<NextResponse> {
  return withRoute(async () => {
    const principal = await requirePrincipalAdmin(request);
    await connectDb();
    const { id, provisionalId } = await ctx.params;

    const parsed = vetSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://fridge-planner.dev/errors/invalid-request',
          title: 'Invalid Request',
          status: 400,
          detail: 'A clause is accepted or rejected.',
        },
        { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
      );
    }

    const { status, body } = await vetClause(id, provisionalId, principal.userId, parsed.data);
    return NextResponse.json(body, { status });
  });
}
