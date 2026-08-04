import { NextResponse } from 'next/server';
import { connectDb } from '@server/db';
import { requirePrincipalAdmin } from '@server/admin-guard';
import { getAllSettings, setSetting } from '@server/services/runtime-settings';
import { record as auditRecord } from '@server/lib/audit';
import { withRoute, problemResponse } from '@server/route-helpers';

// GET /api/v1/admin/settings — effective values (stored override ?? code default).
export async function GET(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    await requirePrincipalAdmin(request);
    await connectDb();
    return NextResponse.json({ settings: await getAllSettings() }, { status: 200 });
  });
}

// PATCH /api/v1/admin/settings — apply overrides (FR-AD-026/030).
// An invalid value is rejected and the PRIOR value remains in force — nothing is
// partially applied, so a bad request can never leave settings half-changed.
export async function PATCH(request: Request): Promise<NextResponse> {
  return withRoute(async () => {
    const { userId } = await requirePrincipalAdmin(request);
    await connectDb();

    const body: unknown = await request.json().catch(() => null);
    if (typeof body !== 'object' || body === null) {
      return problemResponse(400, 'Invalid input', 'Body must be an object of setting keys');
    }

    // Validate EVERY key first, then write — all-or-nothing.
    const entries = Object.entries(body as Record<string, unknown>);
    for (const [key, value] of entries) {
      const check = await setSetting(key, value, userId);
      if (!check.ok) return problemResponse(400, 'Invalid input', check.error ?? 'Invalid value');
    }

    await auditRecord(userId, 'settings.update', { type: 'setting' });
    return NextResponse.json({ settings: await getAllSettings() }, { status: 200 });
  });
}
