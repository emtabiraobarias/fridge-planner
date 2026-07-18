import mongoose, { type Document, type Model, Schema } from 'mongoose';
import type { IGroceryList, IGroceryListItem } from '../types/grocery-list';
import { GROCERY_CATEGORIES } from '../types/grocery-list';

export type GroceryListDocument = IGroceryList & Document;

const purchaseReceiptSchema = new Schema(
  {
    inventoryItemId: { type: String, required: true },
    quantityAdded: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    merged: { type: Boolean, required: true },
  },
  { _id: false },
);

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
    purchaseReceipt: { type: purchaseReceiptSchema, required: false },
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

// Reuse the compiled model across Next.js dev hot-reloads (avoids OverwriteModelError).
export const GroceryList: Model<IGroceryList> =
  (mongoose.models['GroceryList'] as Model<IGroceryList> | undefined) ??
  mongoose.model<IGroceryList>('GroceryList', groceryListSchema);
