import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MealPlan } from '../../src/models/meal-plan.js';
import { MEAL_TYPES } from '../../src/types/meal-plan.js';

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  // Ensure compound unique index is built before tests run
  await MealPlan.ensureIndexes();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await mongoose.connection.dropDatabase();
  await MealPlan.ensureIndexes();
});

const weekStart = new Date('2026-04-06T00:00:00.000Z');
const mockMeal = {
  mealName: 'Chicken Fried Rice',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 25,
  cuisine: 'Asian',
  description: 'Quick rice dish.',
  usesIngredients: ['chicken', 'rice'],
  expiringIngredients: ['chicken'],
  missingIngredients: [],
};

describe('MealPlan model', () => {
  it('exports MEAL_TYPES constant with all four types', () => {
    expect(MEAL_TYPES).toEqual(['breakfast', 'lunch', 'dinner', 'snack']);
  });

  it('saves a valid plan with entries', async () => {
    const plan = new MealPlan({
      userId: 'user-1',
      weekStart,
      entries: [
        {
          slotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          date: new Date('2026-04-06T00:00:00.000Z'),
          mealType: 'dinner',
          meal: mockMeal,
        },
      ],
    });
    const saved = await plan.save();
    expect(saved.userId).toBe('user-1');
    expect(saved.entries).toHaveLength(1);
    expect(saved.entries[0].slotId).toBe('a1b2c3d4-e5f6-7890-abcd-ef1234567890');
    expect(saved.entries[0].mealType).toBe('dinner');
  });

  it('defaults entries to empty array', async () => {
    const plan = new MealPlan({ userId: 'user-2', weekStart });
    const saved = await plan.save();
    expect(saved.entries).toEqual([]);
  });

  it('rejects an entry with an invalid mealType', async () => {
    const plan = new MealPlan({
      userId: 'user-3',
      weekStart,
      entries: [
        {
          slotId: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
          date: new Date(),
          mealType: 'brunch',
          meal: mockMeal,
        },
      ],
    });
    await expect(plan.save()).rejects.toThrow();
  });

  it('rejects duplicate (userId, weekStart) combinations', async () => {
    await new MealPlan({ userId: 'user-4', weekStart }).save();
    const duplicate = new MealPlan({ userId: 'user-4', weekStart });
    await expect(duplicate.save()).rejects.toThrow();
  });

  it('allows same weekStart for different users', async () => {
    await new MealPlan({ userId: 'user-5', weekStart }).save();
    const different = new MealPlan({ userId: 'user-6', weekStart });
    await expect(different.save()).resolves.toBeDefined();
  });

  it('requires userId', async () => {
    const plan = new MealPlan({ weekStart });
    await expect(plan.save()).rejects.toThrow();
  });

  it('requires weekStart', async () => {
    const plan = new MealPlan({ userId: 'user-7' });
    await expect(plan.save()).rejects.toThrow();
  });

  it('does not add _id to entry subdocuments', async () => {
    const plan = new MealPlan({
      userId: 'user-8',
      weekStart,
      entries: [
        {
          slotId: 'b2c3d4e5-f6a7-8901-bcde-f12345678901',
          date: new Date(),
          mealType: 'lunch',
          meal: mockMeal,
        },
      ],
    });
    const saved = await plan.save();
    expect((saved.entries[0] as Record<string, unknown>)['_id']).toBeUndefined();
  });
});
