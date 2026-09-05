import 'server-only';
import mongoose from 'mongoose';

/**
 * Narrow a `userId` to something that can actually be an `accounts._id` — or `null`.
 *
 * ⚠️ Exists because `Account.findById(userId)` does NOT return null for a value that is not an
 * ObjectId. Mongoose **throws a CastError**, which `withRoute` turns into a 500.
 *
 * And non-ObjectId identities are ordinary here, not exotic:
 *   - the dev seam issues `anonymous`, and any `x-user-id` a test or script sends;
 *   - EVERY identity is a provider subject until `migrate-account-identities.mjs` has run;
 *   - `012`'s detached-reporter sentinel is the literal string `__erased__`.
 *
 * This helper exists because the same bug was written three times in spec 013 — in the purge
 * delete list, in the account controllers, and in the provider-account bridge — and each time
 * it was found by a test rather than by reading the code. Two of the three were pre-existing
 * paths that spec 013 made reachable with a new kind of id, so the third would not have been
 * the last. Route every `_id` lookup keyed on a `userId` through here.
 */
export function asAccountId(userId: string): string | null {
  return mongoose.isValidObjectId(userId) ? userId : null;
}
