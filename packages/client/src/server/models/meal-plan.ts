import mongoose, { type Document, type Model, Schema } from 'mongoose';
import { MEAL_TYPES, type IMealPlan, type IMealPlanEntry } from '../types/meal-plan';

export type MealPlanDocument = IMealPlan & Document;

const depletedSnapshotSchema = new Schema(
  {
    name: { type: String, required: true },
    quantity: { type: Number, required: true },
    unit: { type: String, required: true },
    category: { type: String, required: true },
    location: { type: String, required: true },
    expiresAt: { type: Date },
    // expirationStatus deliberately absent — the InventoryItem pre-save hook recomputes it on restore.
  },
  { _id: false },
);

const receiptLineSchema = new Schema(
  {
    inventoryItemId: { type: String },
    name: { type: String, required: true },
    quantityConsumed: { type: Number, required: true },
    unit: { type: String, required: true },
    depletedSnapshot: { type: depletedSnapshotSchema },
  },
  { _id: false },
);

const entrySchema = new Schema<IMealPlanEntry>(
  {
    slotId: { type: String, required: true },
    date: { type: Date, required: true },
    mealType: { type: String, required: true, enum: MEAL_TYPES },
    meal: { type: Schema.Types.Mixed, required: true },
    // Spec 006 lifecycle. NO default on status: a default would materialize on legacy
    // documents at hydration and break the "absent = cooked" cutover rule (FR-MC-011).
    status: { type: String, enum: ['planned', 'cooked'] },
    cookedAt: { type: Date },
    consumedItems: { type: [receiptLineSchema], default: undefined },
  },
  { _id: false },
);

const mealPlanSchema = new Schema<IMealPlan>(
  {
    userId: { type: String, required: true, index: true },
    weekStart: { type: Date, required: true },
    entries: { type: [entrySchema], default: [] },
  },
  { timestamps: true },
);

mealPlanSchema.index({ userId: 1, weekStart: 1 }, { unique: true });

// Reuse the compiled model across Next.js dev hot-reloads (avoids OverwriteModelError).
export const MealPlan: Model<IMealPlan> =
  (mongoose.models['MealPlan'] as Model<IMealPlan> | undefined) ??
  mongoose.model<IMealPlan>('MealPlan', mealPlanSchema);
