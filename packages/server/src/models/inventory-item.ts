import mongoose, { type Document, type Model, Schema } from 'mongoose';
import { getExpirationStatus, type ExpirationStatus } from '../lib/expiration.js';

export const CATEGORIES = [
  'Produce', 'Dairy', 'Meat', 'Seafood',
  'Grains', 'Pantry', 'Condiments', 'Frozen', 'Other',
] as const;

export const LOCATIONS = ['fridge', 'freezer', 'pantry'] as const;

export type Category = (typeof CATEGORIES)[number];
export type Location = (typeof LOCATIONS)[number];

export interface IInventoryItem {
  userId: string;
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  location: Location;
  expiresAt?: Date;
  expirationStatus: ExpirationStatus;
  createdAt: Date;
  updatedAt: Date;
}

export type InventoryItemDocument = IInventoryItem & Document;

const inventoryItemSchema = new Schema<IInventoryItem>(
  {
    userId: { type: String, required: true, index: true },
    name: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true, trim: true },
    category: { type: String, required: true, enum: CATEGORIES },
    location: { type: String, required: true, enum: LOCATIONS, default: 'fridge' },
    expiresAt: { type: Date, index: true },
    expirationStatus: {
      type: String,
      enum: ['expired', 'expiring-soon', 'normal', 'none'],
      default: 'none',
    },
  },
  { timestamps: true },
);

// Recompute expirationStatus before every save
inventoryItemSchema.pre('save', function () {
  this.expirationStatus = getExpirationStatus(this.expiresAt);
});

inventoryItemSchema.pre('findOneAndUpdate', function () {
  const update = this.getUpdate() as Partial<IInventoryItem> | null;
  if (update && 'expiresAt' in update) {
    update.expirationStatus = getExpirationStatus(
      update.expiresAt as Date | undefined,
    );
  }
});

export const InventoryItem: Model<IInventoryItem> = mongoose.model<IInventoryItem>(
  'InventoryItem',
  inventoryItemSchema,
);
