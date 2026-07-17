import mongoose, { type Document, type Model, Schema } from 'mongoose';

/**
 * Per-user learned quick-add defaults, keyed by item name as typed (spec 005 US3).
 * Supplies tentative defaults only — never blocks a parse (FR-IQ-018). The collection
 * name is shared with the roadmap's planned ingredient↔inventory mapping (backlog #2).
 */
export interface IIngredientAlias {
  userId: string;
  nameKey: string;
  category?: string;
  location?: string;
  unit?: string;
  /** Days-until-expiry observed on explicit adds; FIFO-capped at 5 (research D4). */
  expiryObservations: number[];
}

export type IngredientAliasDocument = IIngredientAlias & Document;

const ingredientAliasSchema = new Schema<IIngredientAlias>(
  {
    userId: { type: String, required: true, index: true },
    nameKey: { type: String, required: true, maxlength: 100 },
    category: { type: String },
    location: { type: String },
    unit: { type: String },
    expiryObservations: { type: [Number], default: [] },
  },
  { timestamps: true, collection: 'ingredient_aliases' },
);

ingredientAliasSchema.index({ userId: 1, nameKey: 1 }, { unique: true });

// Reuse the compiled model across Next.js dev hot-reloads (avoids OverwriteModelError).
export const IngredientAlias: Model<IIngredientAlias> =
  (mongoose.models['IngredientAlias'] as Model<IIngredientAlias> | undefined) ??
  mongoose.model<IIngredientAlias>('IngredientAlias', ingredientAliasSchema);
