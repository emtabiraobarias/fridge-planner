import { NextResponse } from 'next/server';
import { z } from 'zod';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { setReply } from '@server/controllers/lifecycle';
import { withRoute } from '@server/route-helpers';

const bodySchema = z.object({ text: z.string().min(1).max(4000) });

interface Ctx {
  params: Promise<{ id: string }>;
}

// PUT /api/v1/admin/lifecycle/:id/reply — the maintainer's written reply (FR-FL-036/037).
export async function PUT(request: Request, ctx: Ctx): Promise<NextResponse> {
  return withRoute(async () => {
    const principal = await requirePrincipalAdmin(request);
    await connectDb();
    const { id } = await ctx.params;

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) {
      return NextResponse.json(
        {
          type: 'https://fridge-planner.dev/errors/invalid-request',
          title: 'Invalid Request',
          status: 400,
          detail: 'A reply needs some text.',
        },
        { status: 400, headers: { 'Content-Type': 'application/problem+json' } },
      );
    }

    const { status, body } = await setReply(id, principal.userId, parsed.data.text);
    return NextResponse.json(body, { status });
  });
}
