import 'server-only';
import mongoose, { type Model, Schema, type Types } from 'mongoose';

/**
 * An account — THE internal identity (spec 013, data-model.md).
 *
 * Before this collection existed, `userId` throughout the app WAS the OIDC `sub`: a value
 * owned by the identity provider, unique only within that provider, and not ours to keep.
 * That made the provider unswappable — moving to another one would have orphaned every
 * user-keyed document. `accounts._id` replaces it, and `identities` is the indirection:
 * the set of provider subjects that resolve to this account (FR-AC-003).
 *
 * `accounts` is the SEVENTH user-keyed store. CLAUDE.md §5's rule applies — it must appear
 * in `lib/account-purge.ts`'s delete list and in the admin export manifest, or erasure
 * silently orphans it.
 */
export interface IAccountIdentity {
  issuer: string;
  subject: string;
  linkedAt: Date;
}

export interface IAccount {
  _id: Types.ObjectId;
  email?: string;
  displayName: string;
  identities: IAccountIdentity[];
  createdAt: Date;
  updatedAt: Date;
}

const accountIdentitySchema = new Schema<IAccountIdentity>(
  {
    issuer: { type: String, required: true },
    subject: { type: String, required: true },
    linkedAt: { type: Date, required: true },
  },
  { _id: false },
);

const accountSchema = new Schema<IAccount>(
  {
    // Lowercased on write: addresses arrive from the token however the provider spells
    // them, and FR-AC-008 matches on this field. Comparing un-normalised values would
    // resolve one person to two accounts.
    email: { type: String, lowercase: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    identities: { type: [accountIdentitySchema], default: [] },
  },
  { timestamps: true },
);

// The per-request resolution path, AND the database-level guarantee that one provider
// subject resolves to at most one account. Application intent is not enough: two concurrent
// first sign-ins both see "no match" and both insert; the loser has to fail rather than
// create a second account holding none of the first one's data. Same reasoning `012` used
// for `{userId, feedbackRecordId}`.
accountSchema.index({ 'identities.issuer': 1, 'identities.subject': 1 }, { unique: true });

// FR-AC-008 matches an incoming verified address against stored ones; uniqueness is what
// makes "matches an existing account" a single answer rather than a choice.
//
// SPARSE, and not optional-by-accident: a token need not carry an email claim, and FR-AC-010
// still requires that pair to resolve to an account. Without `sparse` every such account
// shares the same null key, so the second one collides with the first — and the natural
// "recover from the duplicate by reading the existing row" handling would hand one user the
// other's data. An account with no address simply matches nothing, which is what FR-AC-009
// already says about an absent claim.
accountSchema.index({ email: 1 }, { unique: true, sparse: true });

export const Account: Model<IAccount> =
  (mongoose.models['Account'] as Model<IAccount>) ??
  mongoose.model<IAccount>('Account', accountSchema);
