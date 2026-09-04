// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';

const ISS = 'https://issuer.test';
const AUD = 'fridge-planner';

let mongod: MongoMemoryServer;
let authenticate: typeof import('@server/auth').authenticate;
let Account: typeof import('@server/models/account').Account;
let privateKey: CryptoKey;

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/inventory', { headers });
}

async function sign(claims: Record<string, unknown> & { sub: string }): Promise<string> {
  const { sub, ...rest } = claims;
  return new SignJWT(rest)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub)
    .setIssuer(ISS)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
}

async function authFor(claims: Record<string, unknown> & { sub: string }): Promise<string> {
  return authenticate(req({ authorization: `Bearer ${await sign(claims)}` }));
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE — import after this line (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ authenticate } = await import('@server/auth'));
  ({ Account } = await import('@server/models/account'));
  await Account.init();

  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  const jwk = (await exportJWK(kp.publicKey)) as JWK;
  jwk.kid = 'test';
  jwk.alg = 'RS256';
  // Inject a LOCAL JWKS through the same globalThis cache the verifier uses — no network.
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
  await Account.deleteMany({});
  process.env['AUTH_MODE'] = 'oidc';
  process.env['AUTH_ISSUER'] = ISS;
  process.env['AUTH_AUDIENCE'] = AUD;
});

describe('authenticate — identity resolution (spec 013 Phase A)', () => {
  it('resolves a recorded (issuer, subject) pair to its internal identifier (FR-AC-004)', async () => {
    const account = await Account.create({
      email: 'ada@example.com',
      displayName: 'Ada',
      identities: [{ issuer: ISS, subject: 'sub-1', linkedAt: new Date() }],
    });
    expect(await authFor({ sub: 'sub-1' })).toBe(account._id.toString());
  });

  it('never returns the provider subject as the user id (FR-AC-002)', async () => {
    // The whole point of the indirection. If this ever regresses, every document written
    // during the regression is keyed to a value the provider owns, and the next provider
    // change orphans it — which is the failure spec 013 exists to prevent.
    const userId = await authFor({ sub: 'sub-1', email: 'ada@example.com', email_verified: true });
    expect(userId).not.toBe('sub-1');
    expect(mongoose.isValidObjectId(userId)).toBe(true);
  });

  it('creates a new account for an unrecorded pair that matches no stored email (FR-AC-010)', async () => {
    const userId = await authFor({ sub: 'new-sub', email: 'grace@example.com', email_verified: true });
    const created = await Account.findById(userId);
    expect(created).not.toBeNull();
    expect(created?.email).toBe('grace@example.com');
    expect(created?.identities).toHaveLength(1);
    expect(created?.identities[0]).toMatchObject({ issuer: ISS, subject: 'new-sub' });
  });

  it('resolves the SAME account on the second request rather than creating another', async () => {
    // Creation happens on a request path that runs for every call, so a non-idempotent
    // create would mint a fresh account — and a fresh empty kitchen — on every page load.
    const first = await authFor({ sub: 'new-sub', email: 'grace@example.com', email_verified: true });
    const second = await authFor({ sub: 'new-sub', email: 'grace@example.com', email_verified: true });
    expect(second).toBe(first);
    expect(await Account.countDocuments()).toBe(1);
  });

  it('creates an account for a token with no email claim at all', async () => {
    // FR-AC-010 is unconditional: an unrecorded pair matching no stored email gets a new
    // identifier. A token without an email claim matches nothing by FR-AC-009, so it must
    // still resolve — refusing here would lock out any provider that omits the claim.
    const userId = await authFor({ sub: 'no-email-sub' });
    expect(mongoose.isValidObjectId(userId)).toBe(true);
    expect(await Account.countDocuments()).toBe(1);
  });

  it('gives two email-less accounts distinct identifiers', async () => {
    // The email index is unique. If it were not sparse, the second email-less account would
    // collide with the first on a null key and one user would be handed the other's data.
    const a = await authFor({ sub: 'anon-1' });
    const b = await authFor({ sub: 'anon-2' });
    expect(a).not.toBe(b);
    expect(await Account.countDocuments()).toBe(2);
  });

  it('does not resolve a recorded subject presented by a DIFFERENT issuer', async () => {
    // Subjects are unique only within an issuer. Matching on subject alone would hand an
    // account to whoever can obtain that subject string at any other provider.
    const account = await Account.create({
      email: 'ada@example.com',
      displayName: 'Ada',
      identities: [{ issuer: 'https://other-idp.test', subject: 'sub-1', linkedAt: new Date() }],
    });
    const userId = await authFor({ sub: 'sub-1' });
    expect(userId).not.toBe(account._id.toString());
  });

  it('takes the display name from the token when it carries one', async () => {
    const userId = await authFor({ sub: 's', email: 'ada@example.com', email_verified: true, name: 'Ada Lovelace' });
    expect((await Account.findById(userId))?.displayName).toBe('Ada Lovelace');
  });

  it('refuses rather than falling back to the subject when the database is unreachable', async () => {
    // Fail CLOSED, unlike the erasure check which fails open. Failing open here would mean
    // returning the provider subject as a userId — writing documents under a key FR-AC-002
    // forbids, which no later migration can reliably untangle. Every route calls connectDb()
    // first anyway, so a request that reaches here without a connection was already doomed.
    const { AuthError } = await import('@server/auth-errors');
    await mongoose.disconnect();
    try {
      await expect(authFor({ sub: 'sub-1' })).rejects.toBeInstanceOf(AuthError);
    } finally {
      const db = await import('@server/db');
      await db.connectDb();
    }
  });
});
