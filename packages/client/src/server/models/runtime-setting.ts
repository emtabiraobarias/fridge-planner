import 'server-only';
import mongoose, { type Document, type Model, Schema } from 'mongoose';
import { RUNTIME_SETTING_KEYS, type IRuntimeSetting } from '../types/runtime-settings';

export type RuntimeSettingDocument = IRuntimeSetting & Document;

const runtimeSettingSchema = new Schema<IRuntimeSetting>(
  {
    key: { type: String, required: true, unique: true, enum: RUNTIME_SETTING_KEYS },
    value: { type: Schema.Types.Mixed, required: true },
    updatedAt: { type: Date, required: true, default: Date.now },
    updatedBy: { type: String, required: true },
  },
  { timestamps: false },
);

export const RuntimeSetting: Model<IRuntimeSetting> =
  (mongoose.models['RuntimeSetting'] as Model<IRuntimeSetting>) ??
  mongoose.model<IRuntimeSetting>('RuntimeSetting', runtimeSettingSchema);
