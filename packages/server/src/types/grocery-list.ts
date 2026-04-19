export type GroceryCategory =
  | 'Produce'
  | 'Dairy'
  | 'Meat'
  | 'Seafood'
  | 'Grains'
  | 'Pantry'
  | 'Condiments'
  | 'Frozen'
  | 'Other';

export const GROCERY_CATEGORIES: GroceryCategory[] = [
  'Produce',
  'Dairy',
  'Meat',
  'Seafood',
  'Grains',
  'Pantry',
  'Condiments',
  'Frozen',
  'Other',
];

export interface IGroceryListItem {
  _id?: string;
  ingredientName: string;
  displayName: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
  isPurchased: boolean;
  isManuallyAdded: boolean;
  sourceMealNames: string[];
  notes: string;
}

export interface IGroceryList {
  userId: string;
  weekStart: Date;
  items: IGroceryListItem[];
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}
