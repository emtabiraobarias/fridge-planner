// @vitest-environment node
import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';

const ISS = 'https://issuer.test';
const AUD = 'fridge-planner';

let authenticate: typeof import('@server/auth').authenticate;
let AuthError: typeof import('@server/auth-errors').AuthError;
let privateKey: CryptoKey;

function req(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost/api/v1/inventory', { headers });
}

async function sign(opts: { sub?: string; iss?: string; aud?: string; exp?: string; key?: CryptoKey } = {}): Promise<string> {
  let b = new SignJWT({}).setProtectedHeader({ alg: 'RS256', kid: 'test' });
  if (opts.sub !== undefined) b = b.setSubject(opts.sub);
  b = b.setIssuer(opts.iss ?? ISS).setAudience(opts.aud ?? AUD).setIssuedAt().setExpirationTime(opts.exp ?? '5m');
  return b.sign(opts.key ?? privateKey);
}

beforeAll(async () => {
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
afterEach(() => {
  delete process.env['AUTH_MODE'];
  delete process.env['AUTH_ISSUER'];
  delete process.env['AUTH_AUDIENCE'];
});

describe('authenticate — oidc mode (FR-D-002/003)', () => {
  it('returns the sub claim for a valid token', async () => {
    const t = await sign({ sub: 'user-1' });
    expect(await authenticate(req({ authorization: `Bearer ${t}` }))).toBe('user-1');
  });
  it('rejects a missing token', async () => {
    await expect(authenticate(req())).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects an expired token (despite clock-skew leeway)', async () => {
    const t = await sign({ sub: 'u', exp: '-1m' });
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects the wrong audience', async () => {
    const t = await sign({ sub: 'u', aud: 'someone-else' });
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects the wrong issuer', async () => {
    const t = await sign({ sub: 'u', iss: 'https://evil.test' });
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects a token signed by an unknown key (tampered / key rotation)', async () => {
    const other = await generateKeyPair('RS256');
    const t = await sign({ sub: 'u', key: other.privateKey });
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(AuthError);
  });
  it('rejects a token with no sub claim', async () => {
    const t = await sign({});
    await expect(authenticate(req({ authorization: `Bearer ${t}` }))).rejects.toBeInstanceOf(AuthError);
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
