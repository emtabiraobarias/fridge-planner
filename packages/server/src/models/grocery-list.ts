import mongoose, { type Document, type Model, Schema } from 'mongoose';
import type { IGroceryList, IGroceryListItem } from '../types/grocery-list.js';
import { GROCERY_CATEGORIES } from '../types/grocery-list.js';

export type GroceryListDocument = IGroceryList & Document;

const groceryListItemSchema = new Schema<IGroceryListItem>(
  {
    ingredientName: { type: String, required: true },
    displayName: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, default: 'servings' },
    category: { type: String, required: true, enum: GROCERY_CATEGORIES },
    isPurchased: { type: Boolean, required: true, default: false },
    isManuallyAdded: { type: Boolean, required: true, default: false },
    sourceMealNames: { type: [String], default: [] },
    notes: { type: String, default: '' },
  },
  { _id: true },
);

const groceryListSchema = new Schema<IGroceryList>(
  {
    userId: { type: String, required: true, index: true },
    weekStart: { type: Date, required: true },
    items: { type: [groceryListItemSchema], default: [] },
    generatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

groceryListSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

export const GroceryList: Model<IGroceryList> = mongoose.model<IGroceryList>(
  'GroceryList',
  groceryListSchema,
);
