import 'server-only';
import mongoose, { type Model, Schema } from 'mongoose';

export const AI_FEATURES = [
  'recommendations',
  'parse-assist',
  'alias-pairing',
  'recipe-verify',
  'feedback-agent',
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];

export interface IAiUsageCounter {
  day: string; // 'YYYY-MM-DD' on the UTC-midnight axis, matching rolling-grocery
  feature: AiFeature;
  calls: number;
}

const aiUsageCounterSchema = new Schema<IAiUsageCounter>(
  {
    day: { type: String, required: true },
    feature: { type: String, required: true, enum: AI_FEATURES },
    calls: { type: Number, required: true, default: 0 },
  },
  { timestamps: false },
);

aiUsageCounterSchema.index({ day: 1, feature: 1 }, { unique: true });

export const AiUsageCounter: Model<IAiUsageCounter> =
  (mongoose.models['AiUsageCounter'] as Model<IAiUsageCounter>) ??
  mongoose.model<IAiUsageCounter>('AiUsageCounter', aiUsageCounterSchema);
