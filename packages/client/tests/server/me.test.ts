// @vitest-environment node
// GET /api/v1/me — identity + privilege for the UI (spec 011, research D11 deviation).
import { describe, it, expect, beforeAll } from 'vitest';

let GET: typeof import('../../app/api/v1/me/route').GET;

beforeAll(async () => {
  process.env['AUTH_MODE'] = 'dev';
  ({ GET } = await import('../../app/api/v1/me/route'));
});

function req(userId = 'u1', roles?: string): Request {
  return new Request('http://localhost/api/v1/me', {
    headers: { 'x-user-id': userId, ...(roles ? { 'x-user-roles': roles } : {}) },
  });
}

describe('GET /api/v1/me', () => {
  it('reports isAdmin:false for an ordinary user', async () => {
    const res = await GET(req('user-a'));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ userId: 'user-a', isAdmin: false });
  });

  it('reports isAdmin:true for an administrator', async () => {
    const res = await GET(req('admin-1', 'admin'));
    expect(await res.json()).toEqual({ userId: 'admin-1', isAdmin: true });
  });

  // Deliberately NOT admin-guarded: every user may ask who they are, and the answer
  // for an ordinary user is simply `false`. Guarding it would make the UI unable to
  // decide what to hide without first being refused.
  it('is available to non-admins rather than returning 403', async () => {
    expect((await GET(req('user-a'))).status).not.toBe(403);
  });

  // It answers about the CALLER only — never a lookup surface for other users.
  it('never reflects a user id supplied in the query string', async () => {
    const res = await GET(
      new Request('http://localhost/api/v1/me?userId=someone-else', {
        headers: { 'x-user-id': 'user-a' },
      }),
    );
    expect(((await res.json()) as { userId: string }).userId).toBe('user-a');
  });
});
