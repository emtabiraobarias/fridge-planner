// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet, type JWK } from 'jose';

/**
 * Spec 013 US4 — an existing user signs in through a NEW issuer and keeps their data.
 *
 * The refusal is the load-bearing half. Matching on an address the new provider has not
 * verified would let anyone who registers with someone else's email inherit that person's
 * inventory, meal plans and feedback — so most of what follows tests when linking must NOT
 * happen.
 */

const OLD_ISS = 'https://old-idp.test';
const NEW_ISS = 'https://new-idp.test';
const AUD = 'fridge-planner';

let mongod: MongoMemoryServer;
let authenticate: typeof import('@server/auth').authenticate;
let Account: typeof import('@server/models/account').Account;
let AdminAuditLog: typeof import('@server/models/admin-audit-log').AdminAuditLog;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let privateKey: CryptoKey;

async function authAs(
  issuer: string,
  sub: string,
  claims: Record<string, unknown> = {},
): Promise<string> {
  const token = await new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'test' })
    .setSubject(sub)
    .setIssuer(issuer)
    .setAudience(AUD)
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);
  return authenticate(
    new Request('http://localhost/api/v1/inventory', {
      headers: { authorization: `Bearer ${token}` },
    }),
  );
}

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE — import after this line (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ authenticate } = await import('@server/auth'));
  ({ Account } = await import('@server/models/account'));
  ({ AdminAuditLog } = await import('@server/models/admin-audit-log'));
  ({ InventoryItem } = await import('@server/models/inventory-item'));
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
  await Promise.all([
    Account.deleteMany({}),
    AdminAuditLog.deleteMany({}),
    InventoryItem.deleteMany({}),
  ]);
  process.env['AUTH_MODE'] = 'oidc';
  process.env['AUTH_AUDIENCE'] = AUD;
  // No AUTH_ISSUER: these tests present tokens from two different issuers, and the resolver
  // takes the issuer from the token's own `iss` claim.
  delete process.env['AUTH_ISSUER'];
});

/** An established user on the OLD provider, with data to lose. */
async function existingUser(email = 'ada@example.com'): Promise<string> {
  const a = await Account.create({
    email,
    displayName: 'Ada',
    identities: [{ issuer: OLD_ISS, subject: 'old-sub', linkedAt: new Date() }],
  });
  await InventoryItem.create({
    userId: a._id.toString(),
    name: 'Milk',
    quantity: 1,
    unit: 'litre',
    category: 'Dairy',
    location: 'fridge',
  });
  return a._id.toString();
}

describe('linking a new provider (FR-AC-008)', () => {
  it('links an unrecorded pair carrying a VERIFIED matching email to the existing account', async () => {
    const id = await existingUser();
    const resolved = await authAs(NEW_ISS, 'new-sub', {
      email: 'ada@example.com',
      email_verified: true,
    });
    expect(resolved).toBe(id);
  });

  it('keeps the user’s data reachable under the new pair', async () => {
    // The whole point of the internal identity. If linking resolved to a NEW account, the
    // person would sign in successfully to an empty kitchen and conclude the app lost it.
    const id = await existingUser();
    await authAs(NEW_ISS, 'new-sub', { email: 'ada@example.com', email_verified: true });
    expect(await InventoryItem.countDocuments({ userId: id })).toBe(1);
  });

  it('records the new pair so the SECOND sign-in resolves without matching again', async () => {
    const id = await existingUser();
    await authAs(NEW_ISS, 'new-sub', { email: 'ada@example.com', email_verified: true });

    const account = await Account.findById(id);
    expect(account?.identities).toHaveLength(2);
    expect(account?.identities.map((i) => i.issuer).sort()).toEqual([NEW_ISS, OLD_ISS].sort());

    // …and the address is no longer load-bearing for this pair: it resolves even if the
    // second token stops carrying an email claim at all.
    expect(await authAs(NEW_ISS, 'new-sub')).toBe(id);
  });

  it('matches case-insensitively', async () => {
    const id = await existingUser('ada@example.com');
    expect(
      await authAs(NEW_ISS, 'new-sub', { email: 'Ada@Example.COM', email_verified: true }),
    ).toBe(id);
  });

  it('still resolves the ORIGINAL pair afterwards', async () => {
    const id = await existingUser();
    await authAs(NEW_ISS, 'new-sub', { email: 'ada@example.com', email_verified: true });
    expect(await authAs(OLD_ISS, 'old-sub')).toBe(id);
  });
});

describe('the refusals (FR-AC-009) — the load-bearing half', () => {
  it('does NOT link when the email is present but UNVERIFIED', async () => {
    // The attack this exists to stop: register at any provider with someone else's address,
    // do not verify it, and inherit their account. `email_verified` is the entire barrier.
    const id = await existingUser();
    const resolved = await authAs(NEW_ISS, 'attacker-sub', {
      email: 'ada@example.com',
      email_verified: false,
    });
    expect(resolved).not.toBe(id);
    expect(await InventoryItem.countDocuments({ userId: resolved })).toBe(0);
  });

  it('does NOT link when the email claim is ABSENT', async () => {
    const id = await existingUser();
    expect(await authAs(NEW_ISS, 'attacker-sub')).not.toBe(id);
  });

  it('does NOT link on a truthy-but-not-true email_verified claim', async () => {
    // Providers have spelled this `"true"` before. A loose check would turn the string into a
    // pass and the barrier into decoration.
    const id = await existingUser();
    expect(
      await authAs(NEW_ISS, 'attacker-sub', { email: 'ada@example.com', email_verified: 'true' }),
    ).not.toBe(id);
  });

  it('leaves the existing account untouched when it refuses', async () => {
    const id = await existingUser();
    await authAs(NEW_ISS, 'attacker-sub', { email: 'ada@example.com', email_verified: false });
    const account = await Account.findById(id);
    expect(account?.identities).toHaveLength(1);
  });
});

describe('an unmatched pair (FR-AC-010)', () => {
  it('creates a NEW account when no stored address matches', async () => {
    await existingUser();
    const resolved = await authAs(NEW_ISS, 'someone-else', {
      email: 'grace@example.com',
      email_verified: true,
    });
    expect(await Account.countDocuments()).toBe(2);
    expect((await Account.findById(resolved))?.email).toBe('grace@example.com');
  });
});

describe('every link is audited (FR-AC-011)', () => {
  it('records the link against the account it resolved to', async () => {
    // A link silently re-points one person's whole history at a new provider identity. If it
    // ever happens wrongly, the audit entry is the only way anyone finds out.
    const id = await existingUser();
    await authAs(NEW_ISS, 'new-sub', { email: 'ada@example.com', email_verified: true });

    const entries = await AdminAuditLog.find({ subjectUserId: id }).lean();
    expect(entries.map((e) => e.action)).toContain('account.identity-link');
  });

  it('records nothing when the link is REFUSED', async () => {
    // A refusal is not a link. Logging one would make the trail read as though the attacker
    // had succeeded.
    const id = await existingUser();
    await authAs(NEW_ISS, 'attacker-sub', { email: 'ada@example.com', email_verified: false });
    const entries = await AdminAuditLog.find({ subjectUserId: id }).lean();
    expect(entries).toHaveLength(0);
  });

  it('records nothing on an ordinary sign-in with an already-linked pair', async () => {
    // This runs on every authenticated request. An entry per request would bury the real
    // links in millions of rows and blow through the 90-day retention.
    const id = await existingUser();
    await authAs(OLD_ISS, 'old-sub');
    await authAs(OLD_ISS, 'old-sub');
    expect(await AdminAuditLog.countDocuments({ subjectUserId: id })).toBe(0);
  });
});

describe('audit history is not rewritten (FR-AC-036/037)', () => {
  it('leaves entries recorded against an old provider subject exactly as they were', async () => {
    // `lib/audit.ts` exports only `record` and `list` — there is deliberately no update path,
    // which is what makes the log append-only (011 FR-AD-022). Migrating identities cannot
    // rewrite history without adding one.
    const { record } = await import('@server/lib/audit');
    await record('admin-1', 'user.export', { userId: 'old-sub', type: 'account' });

    const { migrate } = await import('../../scripts/migrate-account-identities.mjs');
    await migrate(mongoose.connection.db, { issuer: OLD_ISS, check: false });

    const entry = await AdminAuditLog.findOne({ action: 'user.export' }).lean();
    expect(entry?.subjectUserId).toBe('old-sub');
  });

  it('resolves an old provider subject to its account when displaying (FR-AC-037)', async () => {
    // The history stays as written, so reading it has to do the translation instead —
    // otherwise the audit view shows a raw subject nobody can tie to a person.
    const id = await existingUser();
    const { resolveSubjectToAccount } = await import('@server/lib/audit-identity');
    expect(await resolveSubjectToAccount('old-sub')).toBe(id);
  });

  it('returns null for a subject that resolves to nothing', async () => {
    const { resolveSubjectToAccount } = await import('@server/lib/audit-identity');
    expect(await resolveSubjectToAccount('never-seen')).toBeNull();
  });
});
