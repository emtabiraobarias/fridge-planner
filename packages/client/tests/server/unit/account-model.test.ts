// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;
let Account: typeof import('@server/models/account').Account;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE, so the import must come after this line —
  // otherwise the suite silently binds to a real localhost:27017 (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ Account } = await import('@server/models/account'));
  // Mongoose builds indexes asynchronously. Without this the unique-index assertions race
  // the build and pass or fail on suite timing — green alone, red in a full run.
  await Account.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Account.deleteMany({});
});

const ISSUER = 'https://idp.example/realms/fridge-planner';

function base(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: 'ada@example.com',
    displayName: 'Ada',
    identities: [{ issuer: ISSUER, subject: 'sub-1', linkedAt: new Date() }],
    ...over,
  };
}

describe('Account model', () => {
  it('stores the identity set as _id-less subdocuments (data-model.md)', async () => {
    const created = await Account.create(base());
    const raw = await Account.collection.findOne({ _id: created._id });
    expect(raw?.['identities']).toHaveLength(1);
    // An `_id` on each pair would be a second identifier for something that is already
    // uniquely keyed by (issuer, subject) — the same choice every subdoc in this codebase makes.
    expect(Object.keys((raw?.['identities'] as Record<string, unknown>[])[0]!)).toEqual([
      'issuer',
      'subject',
      'linkedAt',
    ]);
  });

  it('rejects a duplicate (issuer, subject) pair', async () => {
    await Account.create(base());
    // The database-level guarantee that one provider subject resolves to at most one
    // account. Application intent is not enough: two concurrent sign-ins of the same new
    // user both see "no match" and both insert, and the loser must fail rather than
    // silently create a second account holding none of the first one's data.
    await expect(
      Account.create(base({ email: 'grace@example.com', displayName: 'Grace' })),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('allows the SAME subject string under a DIFFERENT issuer', async () => {
    // Subjects are only unique within an issuer. Keying on subject alone would collide
    // across providers — the exact case US4 exists for.
    await Account.create(base());
    await expect(
      Account.create(
        base({
          email: 'grace@example.com',
          displayName: 'Grace',
          identities: [{ issuer: 'https://other-idp.example', subject: 'sub-1', linkedAt: new Date() }],
        }),
      ),
    ).resolves.toBeTruthy();
  });

  it('rejects a duplicate email', async () => {
    // FR-AC-008 matches an incoming verified address against stored ones; uniqueness is
    // what makes "matches an existing account" a single answer rather than a choice.
    await Account.create(base());
    await expect(
      Account.create(
        base({ identities: [{ issuer: ISSUER, subject: 'sub-2', linkedAt: new Date() }] }),
      ),
    ).rejects.toMatchObject({ code: 11000 });
  });

  it('lowercases the stored email so matching is case-insensitive', async () => {
    // Addresses arrive from the token however the provider spells them. FR-AC-008 compares
    // them, so the comparison has to be on a normalised value or "Ada@Example.com" and
    // "ada@example.com" resolve to two accounts for one person.
    const created = await Account.create(base({ email: 'Ada@Example.COM' }));
    expect(created.email).toBe('ada@example.com');
  });

  it('records createdAt and updatedAt', async () => {
    const created = await Account.create(base());
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });
});
