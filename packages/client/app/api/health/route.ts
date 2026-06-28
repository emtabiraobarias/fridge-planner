import { NextResponse } from 'next/server';

// Public health check (FR-D-006) — no authentication; used by Docker/compose + smoke.
export function GET(): NextResponse {
  return NextResponse.json({ status: 'ok' });
}
