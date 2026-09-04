// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';

const ISS_A = 'https://issuer-a.test';
const ISS_B = 'https://issuer-b.test';
const AUD = 'fridge-planner';

let mongod: MongoMemoryServer;
let authenticate: typeof import('@server/auth').authenticate;
let AuthError: typeof import('@server/auth-errors').AuthError;
let Account: typeof import('@server/models/account').Account;
let AccountErasure: typeof import('@server/models/account-erasure').AccountErasure;
let privateKey: CryptoKey;

async function authAs(issuer: string, sub: string): Promise<string> {
  const token = await new SignJWT({})
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return authenticate(
    new Request('http://localhost/api/v1/inventory', { headers: { authorization: `Bearer ${token}` } }),
  );
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE — import after this line (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ authenticate } = await import('@server/auth'));
  ({ AuthError } = await import('@server/auth-errors'));
  ({ Account } = await import('@server/models/account'));
  ({ AccountErasure } = await import('@server/models/account-erasure'));
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
  delete process.env['AUTH_AUDIENCE'];
});

beforeEach(async () => {
  await Account.deleteMany({});
  await AccountErasure.deleteMany({});
  process.env['AUTH_MODE'] = 'oidc';
  process.env['AUTH_AUDIENCE'] = AUD;
  // No AUTH_ISSUER: these tests deliberately present tokens from two different issuers, and
  // the resolver takes the issuer from the token's own `iss` claim.
  delete process.env['AUTH_ISSUER'];
});

async function erase(userId: string): Promise<void> {
  await AccountErasure.create({
    userId,
    erasedAt: new Date(),
    purgeAfter: new Date(Date.now() + 30 * 86_400_000),
    erasedBy: 'admin-1',
  });
}

describe('erasure is keyed by internal identifier (FR-AC-038)', () => {
  it('still refuses a request arriving under a SECOND linked provider pair', async () => {
    // The failure this prevents: keyed by provider subject, an erasure recorded against the
    // old subject does not match a request arriving under the new one — so on migration day,
    // or the first time a second provider is linked, deleted accounts come back to life.
    const account = await Account.create({
      email: 'ada@example.com',
      displayName: 'Ada',
      identities: [
        { issuer: ISS_A, subject: 'sub-a', linkedAt: new Date() },
        { issuer: ISS_B, subject: 'sub-b', linkedAt: new Date() },
      ],
    });
    await erase(account._id.toString());

    await expect(authAs(ISS_A, 'sub-a')).rejects.toBeInstanceOf(AuthError);
    await expect(authAs(ISS_B, 'sub-b')).rejects.toBeInstanceOf(AuthError);
  });

  it('does not refuse an erasure row still keyed by a provider subject', async () => {
    // The other half of the same statement, and the reason the migration has to rewrite
    // `accounterasures` too: a leftover row keyed by the subject matches nothing and silently
    // stops refusing. Asserting it here means the migration's coverage of that collection is
    // load-bearing rather than incidental.
    const account = await Account.create({
      email: 'ada@example.com',
      displayName: 'Ada',
      identities: [{ issuer: ISS_A, subject: 'sub-a', linkedAt: new Date() }],
    });
    await erase('sub-a');
    await expect(authAs(ISS_A, 'sub-a')).resolves.toBe(account._id.toString());
  });

  it('lets a restored account back in', async () => {
    const account = await Account.create({
      email: 'ada@example.com',
      displayName: 'Ada',
      identities: [{ issuer: ISS_A, subject: 'sub-a', linkedAt: new Date() }],
    });
    await erase(account._id.toString());
    await AccountErasure.updateOne(
      { userId: account._id.toString() },
      { $set: { restoredAt: new Date() } },
    );
    await expect(authAs(ISS_A, 'sub-a')).resolves.toBe(account._id.toString());
  });
});
