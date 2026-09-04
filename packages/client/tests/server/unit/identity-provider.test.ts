// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let identityProvider: typeof import('@server/services/identity-provider').identityProvider;
let IdentityProviderError: typeof import('@server/services/identity-provider').IdentityProviderError;

const JWKS = 'http://keycloak:8080/realms/fridge-planner/protocol/openid-connect/certs';

beforeEach(async () => {
  ({ identityProvider, IdentityProviderError } = await import('@server/services/identity-provider'));
  process.env['AUTH_JWKS_URI'] = JWKS;
  process.env['IDP_ADMIN_CLIENT_ID'] = 'fridge-planner-admin';
  process.env['IDP_ADMIN_CLIENT_SECRET'] = 'shh';
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env['AUTH_JWKS_URI'];
  delete process.env['IDP_ADMIN_CLIENT_ID'];
  delete process.env['IDP_ADMIN_CLIENT_SECRET'];
});

/** Stub the token call, then answer the admin call however the test wants. */
function stubProvider(admin: () => Response): { calls: string[] } {
  const calls: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url.includes('/protocol/openid-connect/token')) {
        return Promise.resolve(
          new Response(JSON.stringify({ access_token: 'admin-token' }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(admin());
    }),
  );
  return { calls };
}

function ok(status = 204, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

function rejected(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('identity-provider adapter', () => {
  it('surfaces the provider’s stated reason for a rejected password (FR-AC-017)', async () => {
    // A generic 500 leaves someone retyping a password with no idea what is wrong with it.
    // The provider is the only thing that knows its own policy, so its sentence has to reach
    // the person — which is the whole reason this error carries `userFacing`.
    stubProvider(() =>
      rejected(400, { errorMessage: 'Invalid password: minimum length 12.' }),
    );
    const err = await identityProvider()
      .createUser({ email: 'ada@example.com', password: 'short', displayName: 'Ada' })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IdentityProviderError);
    expect((err as InstanceType<typeof IdentityProviderError>).message).toBe(
      'Invalid password: minimum length 12.',
    );
    expect((err as InstanceType<typeof IdentityProviderError>).userFacing).toBe(true);
  });

  it('reads a reason from error_description too', async () => {
    // Keycloak spells it differently per endpoint; picking one key would make the reason
    // vanish on half the failures.
    stubProvider(() => rejected(400, { error_description: 'Email already exists' }));
    const err = await identityProvider()
      .createUser({ email: 'a@b.c', password: 'x', displayName: 'A' })
      .catch((e: unknown) => e);
    expect((err as Error).message).toBe('Email already exists');
  });

  it('does NOT mark a provider failure as user-facing', async () => {
    // A 5xx is the provider failing, not the input being wrong. Showing its internals to a
    // user tells them nothing they can act on and leaks the deployment's shape.
    stubProvider(() => rejected(503, { errorMessage: 'db pool exhausted at node-3' }));
    const err = await identityProvider()
      .createUser({ email: 'a@b.c', password: 'x', displayName: 'A' })
      .catch((e: unknown) => e);
    expect((err as InstanceType<typeof IdentityProviderError>).userFacing).toBe(false);
  });

  it('keeps the status so a caller can answer 409 without disclosing anything', async () => {
    // FR-AC-016 refuses a duplicate registration WITHOUT saying whether the address is
    // registered. That decision belongs to the controller, so the adapter passes the status
    // up rather than describing it.
    stubProvider(() => rejected(409, { errorMessage: 'User exists with same email' }));
    const err = await identityProvider()
      .createUser({ email: 'a@b.c', password: 'x', displayName: 'A' })
      .catch((e: unknown) => e);
    expect((err as InstanceType<typeof IdentityProviderError>).status).toBe(409);
  });

  it('refuses clearly when the credentials are not configured', async () => {
    // Until the operator creates the service account, registration cannot work. Saying so is
    // better than a stack trace, and every READ path is unaffected — this throws only when an
    // account operation is actually attempted.
    delete process.env['IDP_ADMIN_CLIENT_SECRET'];
    await expect(
      identityProvider().createUser({ email: 'a@b.c', password: 'x', displayName: 'A' }),
    ).rejects.toBeInstanceOf(IdentityProviderError);
  });

  it('derives the admin endpoint from AUTH_JWKS_URI, not a second variable', async () => {
    // In production AUTH_JWKS_URI is the INTERNAL address while AUTH_ISSUER is public, which
    // is exactly what an admin call should use. A separate variable could disagree with the
    // realm we actually verify tokens against, and the failure would be silent: tokens
    // verified against one realm, users created in another.
    const { calls } = stubProvider(() => ok(201, { location: '/users/new-sub' }));
    await identityProvider().createUser({ email: 'a@b.c', password: 'x', displayName: 'A' });
    expect(calls).toContain('POST http://keycloak:8080/admin/realms/fridge-planner/users');
  });

  it('returns the subject the provider assigns', async () => {
    stubProvider(() => ok(201, { location: '/admin/realms/fridge-planner/users/abc-123' }));
    await expect(
      identityProvider().createUser({ email: 'a@b.c', password: 'x', displayName: 'A' }),
    ).resolves.toBe('abc-123');
  });

  it('creates the account UNVERIFIED', async () => {
    // The refusal in authenticate() is what actually enforces FR-AC-014, but sending
    // emailVerified:true here would hand out a session before anyone proved they own the
    // address.
    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/protocol/openid-connect/token')) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: 't' }), { status: 200 }));
        }
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Promise.resolve(ok(201, { location: '/users/s' }));
      }),
    );
    await identityProvider().createUser({ email: 'a@b.c', password: 'x', displayName: 'A' });
    expect(sent['emailVerified']).toBe(false);
  });

  it('suspends by disabling rather than deleting (FR-AC-039/040)', async () => {
    // The erasure window is reversible, so the account has to survive it.
    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/protocol/openid-connect/token')) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: 't' }), { status: 200 }));
        }
        expect(init?.method).not.toBe('DELETE');
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Promise.resolve(ok());
      }),
    );
    await identityProvider().suspend('sub-1');
    expect(sent['enabled']).toBe(false);
  });

  it('resume is the exact inverse of suspend', async () => {
    let sent: Record<string, unknown> = {};
    vi.stubGlobal(
      'fetch',
      vi.fn((url: string, init?: RequestInit) => {
        if (url.includes('/protocol/openid-connect/token')) {
          return Promise.resolve(new Response(JSON.stringify({ access_token: 't' }), { status: 200 }));
        }
        sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
        return Promise.resolve(ok());
      }),
    );
    await identityProvider().resume('sub-1');
    expect(sent['enabled']).toBe(true);
  });

  it('never sends password material for a reset — it asks the provider to run one', async () => {
    // FR-AC-033: the app handles no password and no reset token, so there is nothing for it
    // to leak, log, or get wrong.
    const { calls } = stubProvider(() => ok());
    await identityProvider().initiatePasswordReset('sub-1');
    expect(calls.some((c) => c.includes('execute-actions-email'))).toBe(true);
  });

  it('escapes the subject in the path', async () => {
    // Subjects come from tokens. A subject containing a slash would otherwise re-target the
    // request at a different admin endpoint entirely.
    const { calls } = stubProvider(() => ok());
    await identityProvider().deleteUser('../../realms/master/users/admin');
    expect(calls.every((c) => !c.includes('realms/master'))).toBe(true);
  });
});
