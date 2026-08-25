import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { getItem } from '@server/controllers/admin-lifecycle';
import { actionSchema, applyAction } from '@server/controllers/lifecycle';
import { withRoute } from '@server/route-helpers';

interface Ctx {
  params: Promise<{ id: string }>;
}

// GET /api/v1/admin/lifecycle/:id — one item in full.
export async function GET(request: Request, ctx: Ctx): Promise<NextResponse> {
  return withRoute(async () => {
    const principal = await requirePrincipalAdmin(request);
    await connectDb();
    // Next 15: params is a Promise.
    const { id } = await ctx.params;
    const { status, body } = await getItem(id, principal.userId);
    return NextResponse.json(body, { status });
  });
}

// PATCH /api/v1/admin/lifecycle/:id — the single action endpoint (spec 012).
//
// One endpoint rather than a verb per action so that every stage change goes through the same
// atomic guarded update, and the legality graph has exactly one caller to be wrong in.
export async function PATCH(request: Request, ctx: Ctx): Promise<NextResponse> {
  return withRoute(async () => {
    const principal = await requirePrincipalAdmin(request);
    await connectDb();
    const { id } = await ctx.params;

    const parsed = actionSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://fridge-planner.dev/errors/invalid-request',
          title: 'Invalid Request',
          status: 400,
          detail: parsed.error.issues[0]?.message ?? 'Unrecognised action.',
        },
        { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
      );
    }

    const { status, body } = await applyAction(id, principal.userId, parsed.data);
    return NextResponse.json(body, { status });
  });
}
