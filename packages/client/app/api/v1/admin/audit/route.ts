import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { list } from '@server/lib/audit';
import { withRoute } from '@server/route-helpers';

// GET /api/v1/admin/audit — read the admin audit trail (spec 011 FR-AD-021).
// GET is the ONLY verb this resource has: entries are append-only, and the absence of
// a write/delete handler is what enforces that (FR-AD-022).
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await requirePrincipalAdmin(request);
    await connectDb();
    const q = new URL(request.url).searchParams;
    const from = q.get('from');
    const to = q.get('to');
    const entries = await list({
      ...(q.get('adminUserId') ? { adminUserId: q.get('adminUserId')! } : {}),
      ...(q.get('subjectUserId') ? { subjectUserId: q.get('subjectUserId')! } : {}),
      ...(from && !isNaN(Date.parse(from)) ? { from: new Date(from) } : {}),
      ...(to && !isNaN(Date.parse(to)) ? { to: new Date(to) } : {}),
    });
    return NextResponse.json({ entries }, { status: 200 });
  });
}
