// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';

const ISS = 'https://issuer.test';
const AUD = 'fridge-planner';

let mongod: MongoMemoryServer;
let POST: typeof import('../../app/api/v1/accounts/register/route').POST;
let Account: typeof import('@server/models/account').Account;
let authenticate: typeof import('@server/auth').authenticate;
let AuthError: typeof import('@server/auth-errors').AuthError;
let resetLimiterKey: typeof import('@server/rate-limit').resetLimiterKey;
let privateKey: CryptoKey;

const IP = '203.0.113.7';

function registerRequest(body: unknown, ip = IP): Request {
  return new Request('http://localhost/api/v1/accounts/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
}

const VALID = { email: 'ada@example.com', password: 'correct-horse-battery', displayName: 'Ada' };

/** Stub the adapter so no test ever reaches a real provider. */
function stubProvider(over: Record<string, unknown> = {}): Record<string, ReturnType<typeof vi.fn>> {
  // A DISTINCT subject per call. A stub returning one fixed subject makes the second
  // registration collide on the unique (issuer, subject) index, so a rate-limit test would
  // read 409s and conclude the limiter fired when it had not.
  let issued = 0;
  const provider = {
    createUser: vi.fn(async () => (issued++ === 0 ? 'provider-sub-1' : `provider-sub-${issued}`)),
    sendVerification: vi.fn(async () => undefined),
    initiatePasswordReset: vi.fn(async () => undefined),
    suspend: vi.fn(async () => undefined),
    resume: vi.fn(async () => undefined),
    deleteUser: vi.fn(async () => undefined),
    ...over,
  };
  vi.spyOn(idp, 'identityProvider').mockReturnValue(provider as never);
  return provider as Record<string, ReturnType<typeof vi.fn>>;
}

let idp: typeof import('@server/services/identity-provider');

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE — import after this line (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_ISSUER'] = ISS;
  const db = await import('@server/db');
  await db.connectDb();
  idp = await import('@server/services/identity-provider');
  ({ POST } = await import('../../app/api/v1/accounts/register/route'));
  ({ Account } = await import('@server/models/account'));
  ({ authenticate } = await import('@server/auth'));
  ({ AuthError } = await import('@server/auth-errors'));
  ({ resetLimiterKey } = await import('@server/rate-limit'));
  await Account.init();

  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  const jwk = (await exportJWK(kp.publicKey)) as JWK;
  jwk.kid = 'test';
  jwk.alg = 'RS256';
  (globalThis as unknown as { _authJwks?: unknown })._authJwks = createLocalJWKSet({ keys: [jwk] });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  delete process.env['AUTH_MODE'];
  delete process.env['AUTH_ISSUER'];
  delete process.env['AUTH_AUDIENCE'];
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await Account.deleteMany({});
  // The limiter is module-level state that SURVIVES between tests: without this the Nth
  // registration gets a 429 and the assertion checks an action that never happened (§8).
  resetLimiterKey(`register:${IP}`);
});

async function tokenFor(sub: string, claims: Record<string, unknown> = {}): Promise<string> {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

describe('POST /api/v1/accounts/register', () => {
  it('creates the account and returns 201 with its identifier', async () => {
    const provider = stubProvider();
    const res = await POST(registerRequest(VALID));
    expect(res.status).toBe(201);

    const body = (await res.json()) as { accountId: string };
    const account = await Account.findById(body.accountId);
    expect(account?.email).toBe('ada@example.com');
    expect(account?.displayName).toBe('Ada');
    // The provider subject is recorded at creation, so the first sign-in resolves to THIS
    // account rather than minting a second one for the same person.
    expect(account?.identities[0]).toMatchObject({ issuer: ISS, subject: 'provider-sub-1' });
    expect(provider['createUser']).toHaveBeenCalledOnce();
  });

  it('asks the provider to send its verification message (FR-AC-013)', async () => {
    const provider = stubProvider();
    await POST(registerRequest(VALID));
    expect(provider['sendVerification']).toHaveBeenCalledWith('provider-sub-1');
  });

  it('refuses a duplicate address WITHOUT confirming it exists (FR-AC-016)', async () => {
    // The requirement is about what the response reveals, not just its status. An error
    // saying "that email is already registered" is an account-enumeration oracle: anyone can
    // discover who has an account here by submitting addresses.
    stubProvider();
    await POST(registerRequest(VALID));
    resetLimiterKey(`register:${IP}`);

    const res = await POST(registerRequest(VALID));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { detail: string; title: string };
    const said = `${body.title} ${body.detail}`.toLowerCase();
    expect(said).not.toMatch(/already regist|already exist|taken|in use|duplicate/);
  });

  it('refuses a duplicate the PROVIDER knows about, the same way', async () => {
    // The other route to the same disclosure: the address may exist at the provider without
    // an `accounts` row — a half-finished earlier registration. The provider answers 409, and
    // that must not become a more talkative error than our own check produces.
    const { IdentityProviderError } = idp;
    stubProvider({
      createUser: vi.fn(async () => {
        throw new IdentityProviderError('User exists with same email', {
          userFacing: true,
          status: 409,
        });
      }),
    });
    const res = await POST(registerRequest(VALID));
    expect(res.status).toBe(409);
    const body = (await res.json()) as { detail: string; title: string };
    expect(`${body.title} ${body.detail}`.toLowerCase()).not.toMatch(/exists|already/);
  });

  it('passes the provider’s password reason through as a 400 (FR-AC-017)', async () => {
    // Without the reason, someone retypes a password with no idea what is wrong with it.
    const { IdentityProviderError } = idp;
    stubProvider({
      createUser: vi.fn(async () => {
        throw new IdentityProviderError('Invalid password: minimum length 12.', {
          userFacing: true,
          status: 400,
        });
      }),
    });
    const res = await POST(registerRequest({ ...VALID, password: 'short' }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { detail: string }).detail).toContain('minimum length 12');
  });

  it('does NOT pass a provider FAILURE through to the user', async () => {
    // A 5xx is the provider failing, not the input being wrong. Its internals say nothing the
    // user can act on and leak the deployment's shape.
    const { IdentityProviderError } = idp;
    stubProvider({
      createUser: vi.fn(async () => {
        throw new IdentityProviderError('db pool exhausted at node-3', { status: 503 });
      }),
    });
    const res = await POST(registerRequest(VALID));
    expect(res.status).toBeGreaterThanOrEqual(500);
    expect(((await res.json()) as { detail: string }).detail).not.toContain('node-3');
  });

  it('limits registration to 5 per minute per source address (FR-AC-018)', async () => {
    stubProvider();
    for (let i = 0; i < 5; i += 1) {
      const res = await POST(registerRequest({ ...VALID, email: `user${i}@example.com` }));
      expect(res.status).toBe(201);
    }
    const sixth = await POST(registerRequest({ ...VALID, email: 'user5@example.com' }));
    expect(sixth.status).toBe(429);
  });

  it('limits per SOURCE ADDRESS, not globally', async () => {
    // Keyed on the submitted email an attacker just varies it; keyed globally, one attacker
    // locks every legitimate visitor out. The source address is the only one that bounds the
    // attacker without bounding everyone else (R7).
    stubProvider();
    for (let i = 0; i < 5; i += 1) {
      await POST(registerRequest({ ...VALID, email: `user${i}@example.com` }));
    }
    resetLimiterKey('register:198.51.100.9');
    const other = await POST(registerRequest({ ...VALID, email: 'someone@example.com' }, '198.51.100.9'));
    expect(other.status).toBe(201);
  });

  it('rejects a malformed body with 400 and creates nothing', async () => {
    stubProvider();
    const res = await POST(registerRequest({ email: 'not-an-email', password: '', displayName: '' }));
    expect(res.status).toBe(400);
    expect(await Account.countDocuments()).toBe(0);
  });

  it('does not leave an orphaned account when the provider create fails', async () => {
    // Order matters: the provider user is created FIRST, so a failure there leaves nothing
    // behind. Written the other way round, a provider outage would strand `accounts` rows
    // that no one can ever sign in to — and whose addresses then block re-registration.
    const { IdentityProviderError } = idp;
    stubProvider({
      createUser: vi.fn(async () => {
        throw new IdentityProviderError('boom', { status: 503 });
      }),
    });
    await POST(registerRequest(VALID));
    expect(await Account.countDocuments()).toBe(0);
  });
});

describe('an unverified account cannot hold a session (FR-AC-014/015)', () => {
  beforeEach(() => {
    process.env['AUTH_MODE'] = 'oidc';
    process.env['AUTH_AUDIENCE'] = AUD;
  });

  async function authWith(claims: Record<string, unknown>): Promise<string> {
    const token = await tokenFor('provider-sub-1', claims);
    return authenticate(
      new Request('http://localhost/api/v1/inventory', {
        headers: { authorization: `Bearer ${token}` },
      }),
    );
  }

  it('refuses a token whose email is not verified', async () => {
    // The provider gates its own login, but the app must not depend on a setting it does not
    // own — and a provider misconfiguration must not become an authentication bypass here.
    stubProvider();
    await POST(registerRequest(VALID));
    await expect(authWith({ email: VALID.email, email_verified: false })).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it('says that verification is outstanding, so the person knows what to do (FR-AC-015)', async () => {
    // A bare "unauthorized" sends someone to reset a password that is perfectly fine.
    stubProvider();
    await POST(registerRequest(VALID));
    const err = await authWith({ email: VALID.email, email_verified: false }).catch(
      (e: unknown) => e as Error,
    );
    expect(err.message.toLowerCase()).toMatch(/verif/);
  });

  it('admits the same person once the claim is verified', async () => {
    stubProvider();
    const res = await POST(registerRequest(VALID));
    const { accountId } = (await res.json()) as { accountId: string };
    await expect(authWith({ email: VALID.email, email_verified: true })).resolves.toBe(accountId);
  });

  it('does not refuse an account that never registered through us', async () => {
    // Accounts predating spec 013 have no registration and no `emailVerified` history. Gating
    // on a flag they never had would lock out every existing user on deploy day.
    const legacy = await Account.create({
      email: 'grace@example.com',
      displayName: 'Grace',
      identities: [{ issuer: ISS, subject: 'provider-sub-1', linkedAt: new Date() }],
    });
    await expect(authWith({})).resolves.toBe(legacy._id.toString());
  });
});
