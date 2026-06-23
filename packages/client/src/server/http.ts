/**
 * Framework-agnostic result of a controller call. Route handlers serialise this
 * into a `NextResponse`; tests can assert on it directly without HTTP plumbing.
 */
export interface ControllerResult {
  status: number;
  body: unknown;
}

/** RFC 7807 Problem Details, as a ControllerResult the handler can serialise. */
export function problem(status: number, title: string, detail: string): ControllerResult {
  return {
    status,
    body: {
      type: `https://fridge-planner.dev/errors/${title.toLowerCase().replace(/\s+/g, '-')}`,
      title,
      status,
      detail,
    },
  };
}
