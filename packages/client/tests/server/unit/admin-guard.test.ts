// @vitest-environment node
// T009 — requirePrincipalAdmin (spec 011 FR-AD-002/003, research D3/D4).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/admin/anything', { headers });
}

beforeEach(() => {
  process.env['AUTH_MODE'] = 'dev';
});
afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('requirePrincipalAdmin (FR-AD-002/003)', () => {
  it('returns the principal for an administrator', async () => {
    const { requirePrincipalAdmin } = await import('@server/admin-guard');
    const p = await requirePrincipalAdmin(req({ 'x-user-id': 'admin-1', 'x-user-roles': 'admin' }));
    expect(p.userId).toBe('admin-1');
    expect(p.isAdmin).toBe(true);
  });

  // FR-AD-003: the refusal must be distinguishable from an authentication failure.
  it('throws ForbiddenError (403), NOT AuthError (401), for an authenticated non-admin', async () => {
    const { requirePrincipalAdmin } = await import('@server/admin-guard');
    const { AuthError, ForbiddenError } = await import('@server/auth-errors');

    const err = await requirePrincipalAdmin(req({ 'x-user-id': 'user-a' })).catch(
      (e: unknown) => e,
    );

    expect(err).toBeInstanceOf(ForbiddenError);
    expect(err).not.toBeInstanceOf(AuthError);
    expect((err as { status: number }).status).toBe(403);
  });

  it('maps ForbiddenError to a 403 Problem JSON through withRoute (D3)', async () => {
    const { withRoute } = await import('@server/route-helpers');
    const { ForbiddenError } = await import('@server/auth-errors');

    const res = await withRoute(async () => {
      throw new ForbiddenError('Administrator privileges are required for this action');
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { title: string; status: number; detail: string };
    expect(body.title).toBe('Forbidden');
    expect(body.status).toBe(403);
    expect(body.detail).toMatch(/Administrator privileges/);
  });

  it('still maps AuthError to 401 — the two paths must not collapse into one', async () => {
    const { withRoute } = await import('@server/route-helpers');
    const { AuthError } = await import('@server/auth-errors');

    const res = await withRoute(async () => {
      throw new AuthError('Missing bearer token');
    });

    expect(res.status).toBe(401);
    expect(((await res.json()) as { title: string }).title).toBe('Unauthorized');
  });
});
