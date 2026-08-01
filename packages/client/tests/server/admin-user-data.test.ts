// @vitest-environment node
// T037 — read-only support view (spec 011 US3: FR-AD-015/016/021).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

let mongod: MongoMemoryServer;
let InventoryItem: typeof import('@server/models/inventory-item').InventoryItem;
let GroceryList: typeof import('@server/models/grocery-list').GroceryList;
let AdminAuditLog: typeof import('@server/models/admin-audit-log').AdminAuditLog;
let GET: typeof import('../../app/api/v1/admin/users/[userId]/data/route').GET;
let INVENTORY_GET: typeof import('../../app/api/v1/inventory/route').GET;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  process.env['MONGODB_URI'] = mongod.getUri();
  process.env['AUTH_MODE'] = 'dev';
  await (await import('@server/db')).connectDb();
  ({ InventoryItem } = await import('@server/models/inventory-item'));
  ({ GroceryList } = await import('@server/models/grocery-list'));
  ({ AdminAuditLog } = await import('@server/models/admin-audit-log'));
  ({ GET } = await import('../../app/api/v1/admin/users/[userId]/data/route'));
  ({ GET: INVENTORY_GET } = await import('../../app/api/v1/inventory/route'));
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
});

function req(userId = 'admin-1', roles = 'admin'): Request {
  return new Request('http://localhost/api/v1/admin/users/user-a/data', {
    headers: { 'x-user-id': userId, ...(roles ? { 'x-user-roles': roles } : {}) },
  });
}
const ctx = (userId: string): { params: Promise<{ userId: string }> } => ({
  params: Promise.resolve({ userId }),
});

async function seedKitchen(userId: string): Promise<void> {
  await InventoryItem.create({
    userId,
    name: 'Spinach',
    quantity: 1,
    unit: 'bunch',
    category: 'Produce',
    location: 'fridge',
  });
  await GroceryList.create({
    userId,
    weekStart: new Date('2026-08-03T00:00:00.000Z'),
    generatedAt: null,
    items: [],
  });
}

describe('GET /admin/users/:userId/data (FR-AD-015)', () => {
  it('returns that user’s inventory, meal plans and grocery lists', async () => {
    await seedKitchen('user-a');

    const res = await GET(req(), ctx('user-a'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      userId: string;
      counts: { inventoryItems: number; groceryLists: number };
      inventory: Array<{ name: string }>;
    };

    expect(body.userId).toBe('user-a');
    expect(body.inventory[0]?.name).toBe('Spinach');
    expect(body.counts.inventoryItems).toBe(1);
    expect(body.counts.groceryLists).toBe(1);
  });

  it('does not leak a different user’s data into the view', async () => {
    await seedKitchen('user-a');
    await InventoryItem.create({
      userId: 'user-b',
      name: 'Bob Milk',
      quantity: 1,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
    });

    const res = await GET(req(), ctx('user-a'));
    const body = (await res.json()) as { inventory: Array<{ name: string }> };
    expect(body.inventory.map((i) => i.name)).toEqual(['Spinach']);
  });

  it('returns an empty-but-valid view for a user with no data', async () => {
    const res = await GET(req(), ctx('nobody'));
    expect(res.status).toBe(200);
    const body = (await res.json()) as { counts: { inventoryItems: number } };
    expect(body.counts.inventoryItems).toBe(0);
  });
});

describe('the support view is read-only (FR-AD-015)', () => {
  // Enforced by absence: no write verb is exported, so there is nothing to call.
  it('exposes GET and nothing else', async () => {
    const mod = await import('../../app/api/v1/admin/users/[userId]/data/route');
    expect(Object.keys(mod).sort()).toEqual(['GET']);
    for (const verb of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(mod).not.toHaveProperty(verb);
    }
  });

  it('leaves the data untouched after a view', async () => {
    await seedKitchen('user-a');
    const before = await InventoryItem.find({ userId: 'user-a' }).lean();
    await GET(req(), ctx('user-a'));
    const after = await InventoryItem.find({ userId: 'user-a' }).lean();
    expect(after).toEqual(before);
  });
});

describe('isolation is unchanged for ordinary users (FR-AD-016)', () => {
  it('refuses a non-admin with 403', async () => {
    await seedKitchen('user-a');
    const res = await GET(req('user-b', ''), ctx('user-a'));
    expect(res.status).toBe(403);
    expect((await res.json()) as { title: string }).toMatchObject({ title: 'Forbidden' });
  });

  // The ordinary inventory route must still show a user only their own items — 011
  // adds an administrator capability, it does not widen `001` FR-036 for anyone else.
  it('still scopes the ordinary inventory endpoint to the caller', async () => {
    await seedKitchen('user-a');
    const res = await INVENTORY_GET(
      new Request('http://localhost/api/v1/inventory', { headers: { 'x-user-id': 'user-b' } }),
    );
    const body = (await res.json()) as { items: unknown[] };
    expect(body.items).toHaveLength(0);
  });
});

describe('every support access is audited (FR-AD-021)', () => {
  it('records the administrator and the subject', async () => {
    await seedKitchen('user-a');
    await GET(req(), ctx('user-a'));

    const entry = await AdminAuditLog.findOne({ action: 'user.data.view' }).lean();
    expect(entry?.adminUserId).toBe('admin-1');
    expect(entry?.subjectUserId).toBe('user-a');
  });

  it('records nothing when the access was refused', async () => {
    await seedKitchen('user-a');
    await GET(req('user-b', ''), ctx('user-a'));
    expect(await AdminAuditLog.countDocuments({})).toBe(0);
  });
});
