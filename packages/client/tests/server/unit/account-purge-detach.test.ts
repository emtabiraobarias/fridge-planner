// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

/**
 * D15 / FR-FL-059..061: work OUTLIVES an erased account.
 *
 * This is a correction, not a new feature. `purgeUserData` listed the lifecycle collection
 * among the models it `deleteMany`s, so erasing a reporter destroyed every item their report
 * had started — including maintainer work in flight. Spec 011 FR-AD-018 demands purge leave no
 * orphans; D15 resolves that by making DETACHMENT the defined outcome rather than deletion.
 */

let mongod: MongoMemoryServer;
let LifecycleItem: typeof import('@server/models/lifecycle-item').LifecycleItem;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let FeedbackRecord: typeof import('@server/models/feedback-record').FeedbackRecord;
let purgeUserData: typeof import('@server/lib/account-purge').purgeUserData;
let USER_KEYED_MODELS: typeof import('@server/lib/account-purge').USER_KEYED_MODELS;
let USER_DETACHED_MODELS: typeof import('@server/lib/account-purge').USER_DETACHED_MODELS;
let ERASED_REPORTER: typeof import('@server/types/lifecycle').ERASED_REPORTER;

const REPORTER = 'reporter-erased';
const OTHER = 'reporter-kept';

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  const db = await import('@server/db');
  await db.connectDb();
  ({ LifecycleItem } = await import('@server/models/lifecycle-item'));
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ FeedbackRecord } = await import('@server/models/feedback-record'));
  ({ purgeUserData, USER_KEYED_MODELS, USER_DETACHED_MODELS } = await import(
    '@server/lib/account-purge'
  ));
  ({ ERASED_REPORTER } = await import('@server/types/lifecycle'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    LifecycleItem.deleteMany({}),
    InventoryItem.deleteMany({}),
    FeedbackRecord.deleteMany({}),
  ]);
});

async function seedItem(userId: string, over: Record<string, unknown> = {}): Promise<void> {
  await LifecycleItem.create({
    userId,
    feedbackRecordId: `rec-${userId}`,
    sourceTitle: 'Grocery rows duplicate',
    sourceType: 'bug',
    sourceAffectedArea: 'grocery',
    stage: 'in-progress',
    ...over,
  });
}

describe('account purge — delete vs detach', () => {
  it('separates the two lists, because they have different semantics (D15)', () => {
    const deleted = USER_KEYED_MODELS.map((m) => m.name);
    const detached = USER_DETACHED_MODELS.map((m) => m.name);

    expect(deleted).toEqual([
      'inventory-item',
      'meal-plan',
      'grocery-list',
      'ingredient-alias',
      'feedback-record',
      // Spec 013's `accounts` — the seventh store, and the only one keyed by `_id`.
      'account',
    ]);
    expect(detached).toEqual(['lifecycle-item']);
    // The lifecycle collection must NOT be in the delete list — that was the defect.
    expect(deleted).not.toContain('lifecycle-item');
  });

  it('still deletes the reporter’s own data outright (FR-AD-018)', async () => {
    await InventoryItem.create({
      userId: REPORTER,
      name: 'milk',
      quantity: 1,
      unit: 'l',
      category: 'Dairy',
      location: 'fridge',
    });
    await purgeUserData(REPORTER);
    expect(await InventoryItem.countDocuments({ userId: REPORTER })).toBe(0);
  });

  it('RETAINS the reporter’s in-flight lifecycle item (FR-FL-059)', async () => {
    await seedItem(REPORTER);
    await purgeUserData(REPORTER);
    // The item survives. Erasing a reporter must never destroy unrelated maintainer work.
    expect(await LifecycleItem.countDocuments({})).toBe(1);
  });

  it('detaches it from reporter-identifying content (FR-FL-060)', async () => {
    await seedItem(REPORTER);
    await purgeUserData(REPORTER);

    const item = await LifecycleItem.findOne({}).lean();
    expect(item?.userId).toBe(ERASED_REPORTER);
    expect(item?.userId).not.toBe(REPORTER);
    expect(item?.sourceTitle).not.toContain('Grocery rows duplicate');
    expect(item?.reporterErasedAt).toBeInstanceOf(Date);
  });

  it('keeps the detached item advanceable and closable (FR-FL-061)', async () => {
    await seedItem(REPORTER);
    await purgeUserData(REPORTER);

    const item = await LifecycleItem.findOne({});
    expect(item).not.toBeNull();
    // Still a real stage, so the maintainer can carry it forward and close it.
    expect(item?.stage).toBe('in-progress');
    item!.stage = 'in-review';
    await expect(item!.save()).resolves.toBeTruthy();
  });

  it('leaves another reporter’s item untouched (SC-FL-003)', async () => {
    await seedItem(REPORTER);
    await seedItem(OTHER);
    await purgeUserData(REPORTER);

    const kept = await LifecycleItem.findOne({ userId: OTHER }).lean();
    expect(kept?.sourceTitle).toBe('Grocery rows duplicate');
    expect(kept?.reporterErasedAt).toBeUndefined();
  });

  it('reports detached items separately from deleted ones', async () => {
    await seedItem(REPORTER);
    const counts = await purgeUserData(REPORTER);
    // A caller that sees only "6 deleted" cannot tell retention happened.
    expect(counts['lifecycle-item']).toBe(1);
  });

  it('is idempotent — a second purge finds nothing left to detach', async () => {
    await seedItem(REPORTER);
    await purgeUserData(REPORTER);
    const second = await purgeUserData(REPORTER);
    expect(second['lifecycle-item']).toBe(0);
    expect(await LifecycleItem.countDocuments({})).toBe(1);
  });
});
