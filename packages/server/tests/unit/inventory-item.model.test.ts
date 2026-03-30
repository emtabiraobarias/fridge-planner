import { describe, it, expect } from '@jest/globals';
import { CATEGORIES, LOCATIONS } from '../../src/models/inventory-item.js';

describe('InventoryItem constants', () => {
  it('exports the 9 standard categories', () => {
    expect(CATEGORIES).toEqual([
      'Produce', 'Dairy', 'Meat', 'Seafood',
      'Grains', 'Pantry', 'Condiments', 'Frozen', 'Other',
    ]);
  });

  it('exports the 3 storage locations', () => {
    expect(LOCATIONS).toEqual(['fridge', 'freezer', 'pantry']);
  });
});
