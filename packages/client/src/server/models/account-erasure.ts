import 'server-only';
import mongoose, { type Model, Schema } from 'mongoose';

/**
 * A soft-deleted account (spec 011 FR-AD-018/019, research D7).
 *
 * Originally this collection existed because there was **no `User` model** — a user was only
 * a `userId` string replicated across six collections, with identity owned by Keycloak, so
 * erasure state had nowhere else to live. Spec 013 added `accounts`, and erasure state stays
 * here anyway: it reuses `011`'s two-phase machinery rather than growing a second one, and
 * an erasure is a fact ABOUT an account rather than a property of it.
 *
 * ⚠️ **`userId` is the INTERNAL identifier** (`accounts._id`), never a provider subject
 * (spec 013 FR-AC-038). This is not cosmetic. The refusal in `authenticate()` runs on every
 * authenticated request, and after a provider link one account answers to several
 * `(issuer, subject)` pairs — so an erasure recorded against the old subject would not refuse
 * a request arriving under the new one, and deleted accounts would come back to life the
 * moment a second provider was linked. `migrate-account-identities.mjs` rewrites existing
 * rows; `tests/server/account-erasure-keying.test.ts` holds the line.
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
