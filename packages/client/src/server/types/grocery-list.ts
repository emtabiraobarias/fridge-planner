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
  purchaseReceipt?: PurchaseReceipt;
  /** Spec 008 day-anchor — set when a manual item is created (FR-RG-004). */
  addedOn?: Date;
  /** Spec 008 day-anchor — set when a line is ticked purchased (FR-RG-005). */
  purchasedOn?: Date;
}

export interface IGroceryList {
  userId: string;
  weekStart: Date;
  items: IGroceryListItem[];
  generatedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PurchaseReceipt {
  inventoryItemId: string;
  quantityAdded: number;
  unit: string;
  merged: boolean;
}

export interface ResolvedPurchaseInput {
  quantity: number;
  unit: string;
  location: 'fridge' | 'freezer' | 'pantry';
  expiresAt?: string;
}
