// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * `accounts` is the SEVENTH user-keyed store (spec 013, data-model.md).
 *
 * CLAUDE.md §5 states the rule plainly — "adding a seventh means adding a line there, or
 * erasure silently orphans it" — and spec 012 is the standing proof that the rule gets
 * broken in practice, in that case by leaving lifecycle items in the delete list.
 *
 * `accounts` breaks the shape the other six share: it is keyed by `_id`, not by a `userId`
 * field, so listing it without saying so would produce a delete that matches nothing and a
 * purge that silently leaves the identity behind.
 */

let mongod: MongoMemoryServer;
let Account: typeof import('@server/models/account').Account;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let purgeUserData: typeof import('@server/lib/account-purge').purgeUserData;
let collectUserData: typeof import('@server/lib/account-purge').collectUserData;
let USER_KEYED_MODELS: typeof import('@server/lib/account-purge').USER_KEYED_MODELS;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ Account } = await import('@server/models/account'));
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ purgeUserData, collectUserData, USER_KEYED_MODELS } = await import(
    '@server/lib/account-purge'
  ));
  await Account.init();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Account.deleteMany({});
  await InventoryItem.deleteMany({});
});

async function makeAccount(email: string): Promise<string> {
  const a = await Account.create({
    email,
    displayName: 'Ada',
    identities: [{ issuer: 'https://issuer.test', subject: `sub-${email}`, linkedAt: new Date() }],
  });
  return a._id.toString();
}

describe('accounts as the seventh user-keyed store', () => {
  it('is listed in USER_KEYED_MODELS', () => {
    expect(USER_KEYED_MODELS.map((m) => m.name)).toContain('account');
  });

  it('is deleted by purgeUserData', async () => {
    // The point of the whole rule. An account left behind after a purge is the user's
    // identity and email address surviving the deletion of everything else about them.
    const userId = await makeAccount('ada@example.com');
    await purgeUserData(userId);
    expect(await Account.findById(userId)).toBeNull();
  });

  it('reports the account in the purge counts', async () => {
    const userId = await makeAccount('ada@example.com');
    const counts = await purgeUserData(userId);
    expect(counts['account']).toBe(1);
  });

  it('purges ONLY the named account', async () => {
    // The `_id` keying is the trap: a delete written as `{ userId }` against this collection
    // matches nothing, and one written carelessly could match everything.
    const target = await makeAccount('ada@example.com');
    const bystander = await makeAccount('grace@example.com');
    await purgeUserData(target);
    expect(await Account.findById(bystander)).not.toBeNull();
  });

  it('leaves other users’ data untouched while deleting the account', async () => {
    const target = await makeAccount('ada@example.com');
    const bystander = await makeAccount('grace@example.com');
    await InventoryItem.create({
      userId: bystander,
      name: 'Milk',
      quantity: 1,
      unit: 'litre',
      category: 'Dairy',
      location: 'fridge',
    });
    await purgeUserData(target);
    expect(await InventoryItem.countDocuments({ userId: bystander })).toBe(1);
  });

  it('includes the account in the data export', async () => {
    // FR-AC-024 exports every store keyed to the caller. Omitting the one that holds their
    // email and display name would under-report what is held — the opposite of the point.
    const userId = await makeAccount('ada@example.com');
    const data = await collectUserData(userId);
    expect(data['account']).toHaveLength(1);
    expect((data['account']![0] as { email: string }).email).toBe('ada@example.com');
  });

  it('skips the account store for an identifier that cannot be an ObjectId', async () => {
    // Pre-migration ids are provider subjects, and the dev seam issues things like
    // `demo-admin`. Mongoose THROWS a CastError on those rather than matching nothing, so
    // without a guard the exception aborts the purge PARTWAY THROUGH — after the first
    // collections have already been emptied and before the rest are touched.
    const counts = await purgeUserData('a-provider-subject-not-an-objectid');
    expect(counts['account']).toBe(0);
    expect(counts['inventory-item']).toBe(0);
  });

  it('reports an empty account list when exporting such an identifier', async () => {
    const data = await collectUserData('a-provider-subject-not-an-objectid');
    expect(data['account']).toEqual([]);
  });
});
