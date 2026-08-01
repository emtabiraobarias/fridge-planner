// @vitest-environment node
// T004/T005 — the Principal seam (spec 011 FR-AD-001/004/005, research D1/D2).
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/anything', { headers });
}

beforeEach(() => {
  process.env['AUTH_MODE'] = 'dev';
  delete process.env['NODE_ENV_OVERRIDE'];
  delete process.env['AUTH_ADMIN_ROLE'];
  delete process.env['AUTH_DEV_ROLES'];
  delete process.env['AUTH_DEV_USER_ID'];
  delete process.env['AUTH_ROLES_CLAIM'];
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe('authenticatePrincipal — dev seam (FR-AD-001, D2)', () => {
  it('returns the userId with no roles and isAdmin=false by default', async () => {
    const { authenticatePrincipal } = await import('@server/auth');
    const p = await authenticatePrincipal(req({ 'x-user-id': 'user-a' }));
    expect(p.userId).toBe('user-a');
    expect(p.roles).toEqual([]);
    expect(p.isAdmin).toBe(false);
  });

  it('grants isAdmin when X-User-Roles carries the admin role', async () => {
    const { authenticatePrincipal } = await import('@server/auth');
    const p = await authenticatePrincipal(req({ 'x-user-id': 'admin-1', 'x-user-roles': 'admin' }));
    expect(p.isAdmin).toBe(true);
    expect(p.roles).toContain('admin');
  });

  it('parses a comma-separated role list and ignores surrounding whitespace', async () => {
    const { authenticatePrincipal } = await import('@server/auth');
    const p = await authenticatePrincipal(
      req({ 'x-user-id': 'u', 'x-user-roles': ' offline_access , admin ' }),
    );
    expect(p.roles).toEqual(['offline_access', 'admin']);
    expect(p.isAdmin).toBe(true);
  });

  it('honours a custom AUTH_ADMIN_ROLE name', async () => {
    process.env['AUTH_ADMIN_ROLE'] = 'fp-operator';
    const { authenticatePrincipal } = await import('@server/auth');
    expect(
      (await authenticatePrincipal(req({ 'x-user-id': 'u', 'x-user-roles': 'admin' }))).isAdmin,
    ).toBe(false);
    expect(
      (await authenticatePrincipal(req({ 'x-user-id': 'u', 'x-user-roles': 'fp-operator' })))
        .isAdmin,
    ).toBe(true);
  });
});

describe('AUTH_DEV_ROLES — the browser-testing seam (dev only)', () => {
  it('supplies default roles when no header is present', async () => {
    process.env['AUTH_DEV_ROLES'] = 'admin';
    const { authenticatePrincipal } = await import('@server/auth');
    expect((await authenticatePrincipal(req({ 'x-user-id': 'me' }))).isAdmin).toBe(true);
  });

  // An EXPLICIT header always wins, so a test or script can still drive an ordinary
  // user on a machine whose env defaults to admin — otherwise every refusal test on a
  // dev box would silently pass as an administrator.
  it('is overridden by an explicit header, including an empty one', async () => {
    process.env['AUTH_DEV_ROLES'] = 'admin';
    const { authenticatePrincipal } = await import('@server/auth');
    const p = await authenticatePrincipal(req({ 'x-user-id': 'me', 'x-user-roles': '' }));
    expect(p.roles).toEqual([]);
    expect(p.isAdmin).toBe(false);
  });

  it('is unreachable in production, like every other dev-seam input (FR-AD-004)', async () => {
    process.env['AUTH_DEV_ROLES'] = 'admin';
    process.env['AUTH_MODE'] = 'dev';
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    delete process.env['AUTH_ALLOW_DEV'];
    const { authenticatePrincipal } = await import('@server/auth');
    await expect(authenticatePrincipal(req({ 'x-user-id': 'me' }))).rejects.toThrow(
      /AUTH_MODE must be "oidc" in production/,
    );
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', configurable: true });
  });
});

describe('authenticate() stays a userId-returning wrapper (D1 — 23 call sites untouched)', () => {
  it('returns the same string it always did', async () => {
    const { authenticate } = await import('@server/auth');
    const userId = await authenticate(req({ 'x-user-id': 'user-a', 'x-user-roles': 'admin' }));
    expect(userId).toBe('user-a');
    expect(typeof userId).toBe('string');
  });
});

describe('role claim extraction from a verified payload (FR-AD-001, D2)', () => {
  it('reads the default Keycloak realm-role path', async () => {
    const { rolesFromPayload } = await import('@server/auth');
    expect(rolesFromPayload({ realm_access: { roles: ['admin', 'x'] } })).toEqual(['admin', 'x']);
  });

  it('reads a custom dotted path when AUTH_ROLES_CLAIM is set', async () => {
    process.env['AUTH_ROLES_CLAIM'] = 'resource_access.fridge-planner.roles';
    const { rolesFromPayload } = await import('@server/auth');
    expect(
      rolesFromPayload({ resource_access: { 'fridge-planner': { roles: ['admin'] } } }),
    ).toEqual(['admin']);
  });

  // A missing or malformed claim must NEVER throw — an unauthorized user is not a
  // broken request, and throwing here would surface as a 500 instead of a clean 403.
  it('returns [] for a missing, non-array, or non-string-array claim rather than throwing', async () => {
    const { rolesFromPayload } = await import('@server/auth');
    expect(rolesFromPayload({})).toEqual([]);
    expect(rolesFromPayload({ realm_access: {} })).toEqual([]);
    expect(rolesFromPayload({ realm_access: { roles: 'admin' } })).toEqual([]);
    expect(rolesFromPayload({ realm_access: { roles: [1, 2] } })).toEqual([]);
    expect(rolesFromPayload(null)).toEqual([]);
  });
});

describe('the dev seam cannot confer admin in production (FR-AD-004, D2)', () => {
  // The guarantee is INHERITED from resolveMode()'s existing two-flag guard, not
  // re-implemented — so this asserts the throw, proving admin-by-header is
  // unreachable in production for the same reason user-by-header already is.
  it('throws before any role is read when NODE_ENV=production without AUTH_ALLOW_DEV', async () => {
    process.env['AUTH_MODE'] = 'dev';
    Object.defineProperty(process.env, 'NODE_ENV', { value: 'production', configurable: true });
    delete process.env['AUTH_ALLOW_DEV'];

    const { authenticatePrincipal } = await import('@server/auth');
    await expect(
      authenticatePrincipal(req({ 'x-user-id': 'attacker', 'x-user-roles': 'admin' })),
    ).rejects.toThrow(/AUTH_MODE must be "oidc" in production/);

    Object.defineProperty(process.env, 'NODE_ENV', { value: 'test', configurable: true });
  });
});
