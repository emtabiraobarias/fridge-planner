import mongoose, { type Document, type Model, Schema } from 'mongoose';
import { MEAL_TYPES, type IMealPlan, type IMealPlanEntry } from '../types/meal-plan';

export type MealPlanDocument = IMealPlan & Document;

const entrySchema = new Schema<IMealPlanEntry>(
  {
    slotId: { type: String, required: true },
    date: { type: Date, required: true },
    mealType: { type: String, required: true, enum: MEAL_TYPES },
    meal: { type: Schema.Types.Mixed, required: true },
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
