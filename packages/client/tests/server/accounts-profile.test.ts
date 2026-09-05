// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

const ISS = 'https://issuer.test';
const IP = '203.0.113.11';

let mongod: MongoMemoryServer;
let meRoute: typeof import('../../app/api/v1/accounts/me/route');
let resetRoute: typeof import('../../app/api/v1/accounts/password-reset/route');
let Account: typeof import('@server/models/account').Account;
let resetLimiterKey: typeof import('@server/rate-limit').resetLimiterKey;
let idp: typeof import('@server/services/identity-provider');

function stubProvider(over: Record<string, unknown> = {}): Record<string, ReturnType<typeof vi.fn>> {
  const provider = {
    createUser: vi.fn(async () => 'provider-sub-1'),
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

/** The dev seam identifies by header, so a test states exactly who it is. */
function asUser(userId: string, init: RequestInit = {}): Request {
  return new Request('http://localhost/api/v1/accounts/me', {
    ...init,
    headers: { 'content-type': 'application/json', 'x-user-id': userId, ...(init.headers ?? {}) },
  });
}

function resetRequest(email: unknown, ip = IP): Request {
  return new Request('http://localhost/api/v1/accounts/password-reset', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ email }),
  });
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE — import after this line (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_ISSUER'] = ISS;
  process.env['AUTH_MODE'] = 'dev';
  const db = await import('@server/db');
  await db.connectDb();
  idp = await import('@server/services/identity-provider');
  meRoute = await import('../../app/api/v1/accounts/me/route');
  resetRoute = await import('../../app/api/v1/accounts/password-reset/route');
  ({ Account } = await import('@server/models/account'));
  ({ resetLimiterKey } = await import('@server/rate-limit'));
  await Account.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  delete process.env['AUTH_MODE'];
  delete process.env['AUTH_ISSUER'];
});

beforeEach(async () => {
  vi.restoreAllMocks();
  await Account.deleteMany({});
  // The limiter is module-level state that SURVIVES between tests (CLAUDE.md §8).
  resetLimiterKey(`password-reset:${IP}`);
});

async function seedAccount(email = 'ada@example.com'): Promise<string> {
  const a = await Account.create({
    email,
    displayName: 'Ada',
    identities: [{ issuer: ISS, subject: 'provider-sub-1', linkedAt: new Date() }],
  });
  return a._id.toString();
}

describe('GET /api/v1/accounts/me', () => {
  it('returns the caller’s profile', async () => {
    const id = await seedAccount();
    const res = await meRoute.GET(asUser(id));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      accountId: id,
      email: 'ada@example.com',
      displayName: 'Ada',
      isAdmin: false,
    });
  });

  it('404s for an identity that cannot be an account id at all', async () => {
    // `findById` THROWS a CastError on a non-ObjectId rather than returning null, so without a
    // guard this is a 500. Non-ObjectId identities are ordinary here: the dev seam issues
    // `anonymous`, and every identity is a provider subject until the migration runs.
    const res = await meRoute.GET(asUser('anonymous'));
    expect(res.status).toBe(404);
  });

  it('404s when the caller has no account document', async () => {
    // The dev seam and pre-013 tokens can both identify someone with no `accounts` row.
    // Answering 200 with empty fields would let the UI render a blank profile as if it were
    // real; 401 would be wrong too, since the caller IS authenticated.
    const res = await meRoute.GET(asUser(new mongoose.Types.ObjectId().toString()));
    expect(res.status).toBe(404);
  });

  it('refuses an unauthenticated caller', async () => {
    process.env['AUTH_MODE'] = 'oidc';
    const res = await meRoute.GET(new Request('http://localhost/api/v1/accounts/me'));
    expect(res.status).toBe(401);
    process.env['AUTH_MODE'] = 'dev';
  });
});

describe('PATCH /api/v1/accounts/me — display name (FR-AC-021)', () => {
  it('persists a new display name', async () => {
    const id = await seedAccount();
    const res = await meRoute.PATCH(
      asUser(id, { method: 'PATCH', body: JSON.stringify({ displayName: 'Ada Lovelace' }) }),
    );
    expect(res.status).toBe(200);
    expect((await Account.findById(id))?.displayName).toBe('Ada Lovelace');
  });

  it('changes only the CALLER’s account', async () => {
    // Every controller in this app scopes by the authenticated identity; an update that took
    // its target from the body would be a trivial account-takeover of the display name.
    const mine = await seedAccount('ada@example.com');
    const theirs = await Account.create({
      email: 'grace@example.com',
      displayName: 'Grace',
      identities: [{ issuer: ISS, subject: 'other-sub', linkedAt: new Date() }],
    });
    await meRoute.PATCH(
      asUser(mine, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Hacked', accountId: theirs._id.toString() }),
      }),
    );
    expect((await Account.findById(theirs._id))?.displayName).toBe('Grace');
  });

  it('rejects an empty or oversized name without touching the record', async () => {
    const id = await seedAccount();
    for (const displayName of ['', '   ', 'x'.repeat(101)]) {
      const res = await meRoute.PATCH(
        asUser(id, { method: 'PATCH', body: JSON.stringify({ displayName }) }),
      );
      expect(res.status).toBe(400);
    }
    expect((await Account.findById(id))?.displayName).toBe('Ada');
  });

  it('does NOT let the caller change their own email (FR-AC-034/035)', async () => {
    // The stored address is what FR-AC-008 matches on when a new provider appears, so a
    // self-service edit would let someone re-point their identity at an address they have not
    // proved they own. It is refreshed from the verified claim instead, and locked at the
    // provider as defence in depth.
    const id = await seedAccount();
    await meRoute.PATCH(
      asUser(id, {
        method: 'PATCH',
        body: JSON.stringify({ displayName: 'Ada', email: 'attacker@example.com' }),
      }),
    );
    expect((await Account.findById(id))?.email).toBe('ada@example.com');
  });
});

describe('POST /api/v1/accounts/password-reset', () => {
  it('asks the provider to send its own reset message (FR-AC-022)', async () => {
    const provider = stubProvider();
    await seedAccount();
    const res = await resetRoute.POST(resetRequest('ada@example.com'));
    expect(res.status).toBe(202);
    expect(provider['initiatePasswordReset']).toHaveBeenCalledWith('provider-sub-1');
  });

  it('answers IDENTICALLY for an address that is not registered (FR-AC-023)', async () => {
    // Any difference — status, body, or a measurable delay in how much work happens — turns
    // this endpoint into an account-enumeration oracle, which is the one thing a signed-out
    // endpoint taking an email address must not be.
    stubProvider();
    await seedAccount();
    const known = await resetRoute.POST(resetRequest('ada@example.com'));
    resetLimiterKey(`password-reset:${IP}`);
    const unknown = await resetRoute.POST(resetRequest('nobody@example.com'));

    expect(unknown.status).toBe(known.status);
    expect(await unknown.text()).toBe(await known.text());
  });

  it('does not call the provider for an unregistered address', async () => {
    // The response is identical, but there is no user to act on — and inventing one would
    // create provider-side state from an unauthenticated request.
    const provider = stubProvider();
    const res = await resetRoute.POST(resetRequest('nobody@example.com'));
    expect(res.status).toBe(202);
    expect(provider['initiatePasswordReset']).not.toHaveBeenCalled();
  });

  it('answers identically for a MALFORMED address too', async () => {
    // A 400 for "not-an-email" and a 202 for a well-formed unknown one still distinguishes
    // nothing about registration — but a 400 for an address that merely LOOKS unusual would.
    // Keeping the shape uniform is cheaper than reasoning about which validation leaks.
    stubProvider();
    const res = await resetRoute.POST(resetRequest('not-an-email'));
    expect(res.status).toBe(202);
  });

  it('stays 202 when the provider itself fails', async () => {
    // A 502 here would say "this address exists and something went wrong for it" — the
    // disclosure FR-AC-023 forbids, arriving through the error path instead of the happy one.
    const { IdentityProviderError } = idp;
    stubProvider({
      initiatePasswordReset: vi.fn(async () => {
        throw new IdentityProviderError('provider down', { status: 503 });
      }),
    });
    await seedAccount();
    const res = await resetRoute.POST(resetRequest('ada@example.com'));
    expect(res.status).toBe(202);
  });

  it('limits reset requests to 10 per minute per source address (FR-AC-044)', async () => {
    stubProvider();
    for (let i = 0; i < 10; i += 1) {
      expect((await resetRoute.POST(resetRequest(`user${i}@example.com`))).status).toBe(202);
    }
    expect((await resetRoute.POST(resetRequest('user10@example.com'))).status).toBe(429);
  });

  it('uses a SEPARATE bucket from registration (FR-AC-044)', async () => {
    // The abuse shapes differ: registration creates provider-side state and sends mail, reset
    // only sends mail to an address that already exists. Sharing a bucket would let one
    // throttle the other and make both limits fiction.
    stubProvider();
    const register = await import('../../app/api/v1/accounts/register/route');
    resetLimiterKey(`register:${IP}`);
    for (let i = 0; i < 10; i += 1) {
      await resetRoute.POST(resetRequest(`user${i}@example.com`));
    }
    const res = await register.POST(
      new Request('http://localhost/api/v1/accounts/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': IP },
        body: JSON.stringify({
          email: 'fresh@example.com',
          password: 'correct-horse-battery',
          displayName: 'Fresh',
        }),
      }),
    );
    expect(res.status).toBe(201);
  });
});
