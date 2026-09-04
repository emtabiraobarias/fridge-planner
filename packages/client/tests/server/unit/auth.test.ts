// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';

const ISS = 'https://issuer.test';
const AUD = 'fridge-planner';

let authenticate: typeof import('@server/auth').authenticate;
let AuthError: typeof import('@server/auth-errors').AuthError;
let privateKey: CryptoKey;
let mongod: MongoMemoryServer;

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/inventory', { headers });
}

async function sign(
  opts: { sub?: string; iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {},
): Promise<string> {
  let b = new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' });
  if (opts.sub !== undefined) b = b.setSubject(opts.sub);
  b = b
    .setIssuer(opts.iss ?? ISS)
    .setAudience(opts.aud ?? AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '5m');
  return b.sign(opts.key ?? privateKey);
}

beforeAll(async () => {
  // Spec 013 gave this file a database. `authenticate()` no longer answers from the token
  // alone — it resolves the provider's (issuer, sub) pair to an internal identifier, and
  // fails closed when it cannot (FR-AC-002). The rejection cases below never reach that
  // point, but the happy path does.
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE — import after this line (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ authenticate } = await import('@server/auth'));
  ({ AuthError } = await import('@server/auth-errors'));
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  const jwk = (await exportJWK(kp.publicKey)) as JWK;
  jwk.kid = 'test';
  jwk.alg = 'RS256';
  // Inject a LOCAL JWKS via the same globalThis cache the verifier uses — no network/IdP.
  (globalThis as unknown as { _authJwks?: unknown })._authJwks = createLocalJWKSet({ keys: [jwk] });
});

beforeEach(() => {
  process.env['AUTH_MODE'] = 'oidc';
  process.env['AUTH_ISSUER'] = ISS;
  process.env['AUTH_AUDIENCE'] = AUD;
});
afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(() => {
  delete process.env['AUTH_MODE'];
  delete process.env['AUTH_ISSUER'];
  delete process.env['AUTH_AUDIENCE'];
});

describe('authenticate — oidc mode (FR-D-002/003)', () => {
  it('resolves a valid token to an internal identifier, never the sub (FR-AC-002)', async () => {
    // Until spec 013 this asserted `toBe('user-1')` — the sub itself. That was the shape the
    // account work had to change: a provider subject is not ours, is unique only within one
    // provider, and cannot be carried to another. Resolution is covered in depth by
    // tests/server/account-resolution.test.ts; what matters here is that the seam every
    // request passes through no longer hands back the raw claim.
    const t = await sign({ sub: 'user-1' });
    const userId = await authenticate(req({ authorization: `Bearer ${t}` }));
    expect(userId).not.toBe('user-1');
    expect(mongoose.isValidObjectId(userId)).toBe(true);
  });
  it('rejects a missing token', async () => {
    await expect(authenticate(req())).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects an expired token (despite clock-skew leeway)', async () => {
    const t = await sign({ sub: 'u', exp: '-1m' });
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(
      AuthError,
    );
  });
  it('rejects the wrong audience', async () => {
    const t = await sign({ sub: 'u', aud: 'someone-else' });
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(
      AuthError,
    );
  });
  it('rejects the wrong issuer', async () => {
    const t = await sign({ sub: 'u', iss: 'https://evil.test' });
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(
      AuthError,
    );
  });
  it('rejects a token signed by an unknown key (tampered / key rotation)', async () => {
    const other = await generateKeyPair('RS256');
    const t = await sign({ sub: 'u', key: other.privateKey });
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(
      AuthError,
    );
  });
  it('rejects a token with no sub claim', async () => {
    const t = await sign({});
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(
      AuthError,
    );
  });
});

describe('authenticate — dev seam (FR-D-007)', () => {
  it('returns the X-User-Id header in dev mode', async () => {
    process.env['AUTH_MODE'] = 'dev';
    expect(await authenticate(req({ 'x-user-id': 'dev-user' }))).toBe('dev-user');
  });
  it('defaults to anonymous in dev mode with no header', async () => {
    process.env['AUTH_MODE'] = 'dev';
    expect(await authenticate(req())).toBe('anonymous');
  });
});

describe('production guard (FR-D-008)', () => {
  it('refuses the dev seam in production unless explicitly acknowledged', async () => {
    const prevNodeEnv = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    process.env['AUTH_MODE'] = 'dev';
    delete process.env['AUTH_ALLOW_DEV'];
    await expect(authenticate(req({ 'x-user-id': 'x' }))).rejects.toThrow(/oidc|dev auth seam/i);
    // the explicit E2E/CI acknowledgment re-enables it
    process.env['AUTH_ALLOW_DEV'] = 'true';
    expect(await authenticate(req({ 'x-user-id': 'x' }))).toBe('x');
    delete process.env['AUTH_ALLOW_DEV'];
    process.env['NODE_ENV'] = prevNodeEnv;
  });
});
