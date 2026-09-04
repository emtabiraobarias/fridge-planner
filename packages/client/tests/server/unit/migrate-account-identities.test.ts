// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;
let migrate: typeof import('../../../scripts/migrate-account-identities.mjs').migrate;
let MIGRATED_COLLECTIONS: readonly string[];
let Account: typeof import('@server/models/account').Account;
let ALL_USER_DATA_MODELS: typeof import('@server/lib/account-purge').ALL_USER_DATA_MODELS;

const ISS = 'https://issuer.test';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  // db.ts reads MONGODB_URI at MODULE SCOPE — import after this line (CLAUDE.md §8).
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ Account } = await import('@server/models/account'));
  ({ ALL_USER_DATA_MODELS } = await import('@server/lib/account-purge'));
  ({ migrate, MIGRATED_COLLECTIONS } = await import(
    '../../../scripts/migrate-account-identities.mjs'
  ));
  await Account.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  for (const name of MIGRATED_COLLECTIONS) {
    await mongoose.connection.collection(name).deleteMany({});
  }
  await Account.deleteMany({});
});

/** Seed one document per collection for a given provider subject. */
async function seed(sub: string): Promise<void> {
  for (const name of MIGRATED_COLLECTIONS) {
    await mongoose.connection.collection(name).insertOne({ userId: sub, marker: name });
  }
}

async function userIdsIn(name: string): Promise<string[]> {
  const docs = await mongoose.connection.collection(name).find({}).toArray();
  return docs.map((d) => String(d['userId']));
}

function run(opts: { check?: boolean } = {}): ReturnType<typeof migrate> {
  return migrate(mongoose.connection.db, { issuer: ISS, check: opts.check ?? false });
}

describe('migrate-account-identities', () => {
  it('covers exactly the collections the app keys by userId', async () => {
    // Asserted against the SHIPPED model list, never a literal. CLAUDE.md §5: adding a
    // seventh user-keyed collection means adding a line, and the way that rule gets broken
    // is a migration script whose hardcoded list quietly falls behind the models. A literal
    // here would be self-satisfying and would not notice.
    const fromModels = ALL_USER_DATA_MODELS.map((m) => m.model.collection.name);
    for (const name of fromModels) {
      expect(MIGRATED_COLLECTIONS).toContain(name);
    }
  });

  it('creates one account per distinct subject (FR-AC-006)', async () => {
    await seed('sub-a');
    await seed('sub-b');
    const report = await run();
    expect(report.accountsCreated).toBe(2);
    expect(await Account.countDocuments()).toBe(2);
  });

  it('records the (issuer, subject) pair so authenticate() resolves the same account', async () => {
    await seed('sub-a');
    await run();
    const account = await Account.findOne({
      identities: { $elemMatch: { issuer: ISS, subject: 'sub-a' } },
    });
    expect(account).not.toBeNull();
  });

  it('rewrites userId in every migrated collection', async () => {
    await seed('sub-a');
    await run();
    const account = await Account.findOne({});
    for (const name of MIGRATED_COLLECTIONS) {
      expect(await userIdsIn(name)).toEqual([account!._id.toString()]);
    }
  });

  it('changes nothing on a second run (idempotent)', async () => {
    // The operator runs --check, then the real thing, and may re-run after a partial
    // failure. A second pass that re-migrated already-internal ids would mint a second
    // account per user and strand the first one's data.
    await seed('sub-a');
    await run();
    const afterFirst = await userIdsIn(MIGRATED_COLLECTIONS[0]!);

    const second = await run();
    expect(second.accountsCreated).toBe(0);
    expect(second.documentsRewritten).toBe(0);
    expect(await Account.countDocuments()).toBe(1);
    expect(await userIdsIn(MIGRATED_COLLECTIONS[0]!)).toEqual(afterFirst);
  });

  it('writes nothing in --check mode', async () => {
    await seed('sub-a');
    const report = await run({ check: true });
    // It still REPORTS what it would do — a check that reports nothing is not a check.
    expect(report.accountsCreated).toBe(1);
    expect(report.documentsRewritten).toBeGreaterThan(0);
    expect(await Account.countDocuments()).toBe(0);
    expect(await userIdsIn(MIGRATED_COLLECTIONS[0]!)).toEqual(['sub-a']);
  });

  it('reuses an account already linked to the subject rather than creating a second', async () => {
    // The half-migrated case: a user signed in after the accounts collection existed, so
    // authenticate() already minted their account, but their documents still carry the sub.
    const existing = await Account.create({
      email: 'ada@example.com',
      displayName: 'Ada',
      identities: [{ issuer: ISS, subject: 'sub-a', linkedAt: new Date() }],
    });
    await seed('sub-a');
    const report = await run();
    expect(report.accountsCreated).toBe(0);
    expect(await Account.countDocuments()).toBe(1);
    expect(await userIdsIn(MIGRATED_COLLECTIONS[0]!)).toEqual([existing._id.toString()]);
  });

  it('leaves the erased-reporter sentinel alone', async () => {
    // `__erased__` is not a person. Migrating it would mint an account for it and re-attach
    // detached lifecycle items to a live identity — undoing spec 012 D15 exactly.
    const lifecycle = 'pipelineitems';
    await mongoose.connection.collection(lifecycle).insertOne({ userId: '__erased__' });
    await run();
    expect(await userIdsIn(lifecycle)).toEqual(['__erased__']);
    expect(await Account.countDocuments()).toBe(0);
  });

  it('reports per-collection counts rather than one total', async () => {
    await seed('sub-a');
    const report = await run({ check: true });
    for (const name of MIGRATED_COLLECTIONS) {
      expect(report.byCollection[name]).toBe(1);
    }
  });
});
