import 'server-only';
import mongoose, { type Model, Schema } from 'mongoose';

/**
 * A soft-deleted account (spec 011 FR-AD-018/019, research D7).
 *
 * This collection exists because there is **no `User` model** in this codebase — a user
 * is only a `userId` string replicated across six collections, with identity owned by
 * Keycloak. Erasure state therefore has nowhere else to live.
 */
export interface IAccountErasure {
  userId: string;
  erasedAt: Date;
  purgeAfter: Date;
  erasedBy: string;
  restoredAt?: Date;
}

const accountErasureSchema = new Schema<IAccountErasure>(
  {
    userId: { type: String, required: true, unique: true },
    erasedAt: { type: Date, required: true },
    purgeAfter: { type: Date, required: true, index: true },
    erasedBy: { type: String, required: true },
    restoredAt: { type: Date },
  },
  { timestamps: false },
);

export const AccountErasure: Model<IAccountErasure> =
  (mongoose.models['AccountErasure'] as Model<IAccountErasure>) ??
  mongoose.model<IAccountErasure>('AccountErasure', accountErasureSchema);
