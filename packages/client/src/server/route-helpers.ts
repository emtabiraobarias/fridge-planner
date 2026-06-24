import 'server-only';
import { NextResponse } from 'next/server';

/** RFC 7807 Problem Details as a NextResponse (the route-handler analogue of http.problem). */
export function problemResponse(status: number, title: string, detail: string): NextResponse {
  return NextResponse.json(
    {
      type: `https://fridge-planner.dev/errors/${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      status,
      detail,
    },
    { status },
  );
}

/**
 * Wrap a route-handler body so any unhandled throw becomes a Problem JSON 500 instead
 * of Next's default error — restoring parity with the retired Express error-handler.
 * Used as `return withRoute(async () => { ... })` so the exported handler keeps its
 * normal Next signature.
 */
export async function withRoute(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (err) {
    console.error('[route] unhandled error', err);
    return problemResponse(500, 'Internal Server Error', 'An unexpected error occurred.');
  }
}
