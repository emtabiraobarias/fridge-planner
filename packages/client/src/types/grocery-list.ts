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

export interface GroceryListItem {
  _id: string;
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

export interface GroceryList {
  _id: string;
  userId: string;
  weekStart: string;
  items: GroceryListItem[];
  generatedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AddGroceryItemPayload {
  displayName: string;
  quantity: number;
  unit: string;
  category: GroceryCategory;
  notes?: string;
}

export interface PatchGroceryItemPayload {
  displayName?: string;
  quantity?: number;
  unit?: string;
  category?: GroceryCategory;
  isPurchased?: boolean;
  notes?: string;
}

export interface CompleteItemPayload {
  itemId: string;
  name: string;
  quantity: number;
  unit: string;
  category: string;
  location?: string;
  expiresAt?: string;
}

export interface CompleteResult {
  created: Array<{ _id: string; name: string }>;
  errors: string[];
}
