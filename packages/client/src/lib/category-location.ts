import type { Category, Location } from '../services/inventory';

export const CATEGORY_LOCATION_DEFAULTS: Record<Category, Location> = {
  Produce: 'fridge',
  Dairy: 'fridge',
  Meat: 'fridge',
  Seafood: 'fridge',
  Grains: 'pantry',
  Pantry: 'pantry',
  Condiments: 'pantry',
  Frozen: 'freezer',
  Other: 'fridge',
};

export function defaultLocationForCategory(category: Category): Location {
  return CATEGORY_LOCATION_DEFAULTS[category] ?? 'fridge';
}
