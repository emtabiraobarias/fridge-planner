import { describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';
import { authMiddleware } from '../../src/middleware/auth.js';
import { AuthError } from '../../src/lib/auth-errors.js';

const ISS = 'https://issuer.test';
const AUD = 'fridge-planner';
let privateKey: CryptoKey;

async function sign(opts: { sub?: string; iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}): Promise<string> {
  let b = new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' });
  if (opts.sub !== undefined) b = b.setSubject(opts.sub);
  b = b.setIssuer(opts.iss ?? ISS).setAudience(opts.aud ?? AUD).setIssuedAt().setExpirationTime(opts.exp ?? '5m');
  return b.sign(opts.key ?? privateKey);
}

/** Run authMiddleware and resolve when next() fires (with or without an error). */
function run(headers: Record<string, string>): Promise<{ req: Request; err?: unknown }> {
  const req = { headers } as unknown as Request;
  return new Promise((resolve) => {
    authMiddleware(req, {} as Response, ((err?: unknown) => resolve({ req, err })) as NextFunction);
  });
}

beforeAll(async () => {
  const kp = await generateKeyPair('RS256');
  privateKey = kp.privateKey;
  const jwk = (await exportJWK(kp.publicKey)) as JWK;
  jwk.kid = 'test';
  jwk.alg = 'RS256';
  (globalThis as unknown as { _authJwks?: unknown })._authJwks = createLocalJWKSet({ keys: [jwk] });
});

beforeEach(() => {
  process.env['AUTH_MODE'] = 'oidc';
  process.env['AUTH_ISSUER'] = ISS;
  process.env['AUTH_AUDIENCE'] = AUD;
});
afterEach(() => {
  delete process.env['AUTH_MODE'];
  delete process.env['AUTH_ISSUER'];
  delete process.env['AUTH_AUDIENCE'];
});

describe('authMiddleware — oidc mode (FR-D-002/003)', () => {
  it('sets req.userId from the sub claim for a valid token', async () => {
    const { req, err } = await run({ authorization: `Bearer ${await sign({ sub: 'user-1' })}` });
    expect(err).toBeUndefined();
    expect(req.userId).toBe('user-1');
  });
  it('rejects a missing token', async () => {
    expect((await run({})).err).toBeInstanceOf(AuthError);
  });
  it('rejects an expired token (despite clock-skew leeway)', async () => {
    expect((await run({ authorization: `Bearer ${await sign({ sub: 'u', exp: '-1m' })}` })).err).toBeInstanceOf(AuthError);
  });
  it('rejects the wrong audience', async () => {
    expect((await run({ authorization: `Bearer ${await sign({ sub: 'u', aud: 'other' })}` })).err).toBeInstanceOf(AuthError);
  });
  it('rejects the wrong issuer', async () => {
    expect((await run({ authorization: `Bearer ${await sign({ sub: 'u', iss: 'https://evil.test' })}` })).err).toBeInstanceOf(AuthError);
  });
  it('rejects a token signed by an unknown key (tampered / rotation)', async () => {
    const other = await generateKeyPair('RS256');
    expect((await run({ authorization: `Bearer ${await sign({ sub: 'u', key: other.privateKey })}` })).err).toBeInstanceOf(AuthError);
  });
  it('rejects a token with no sub claim', async () => {
    expect((await run({ authorization: `Bearer ${await sign({})}` })).err).toBeInstanceOf(AuthError);
  });
});

describe('authMiddleware — dev seam (FR-D-007)', () => {
  it('uses X-User-Id in dev mode', async () => {
    process.env['AUTH_MODE'] = 'dev';
    const { req, err } = await run({ 'x-user-id': 'dev-user' });
    expect(err).toBeUndefined();
    expect(req.userId).toBe('dev-user');
  });
  it('defaults to anonymous in dev mode', async () => {
    process.env['AUTH_MODE'] = 'dev';
    expect((await run({})).req.userId).toBe('anonymous');
  });
});

describe('production guard (FR-D-008)', () => {
  it('refuses the dev seam in production unless explicitly acknowledged', async () => {
    const prev = process.env['NODE_ENV'];
    process.env['NODE_ENV'] = 'production';
    process.env['AUTH_MODE'] = 'dev';
    delete process.env['AUTH_ALLOW_DEV'];
    expect((await run({ 'x-user-id': 'x' })).err).toBeInstanceOf(Error);
    process.env['AUTH_ALLOW_DEV'] = 'true';
    const ok = await run({ 'x-user-id': 'x' });
    expect(ok.err).toBeUndefined();
    expect(ok.req.userId).toBe('x');
    delete process.env['AUTH_ALLOW_DEV'];
    process.env['NODE_ENV'] = prev;
  });
});
