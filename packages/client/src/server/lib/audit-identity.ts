import 'server-only';
import { Account } from '../models/account';

/**
 * Translate a recorded audit subject into the account it names (spec 013 FR-AC-037).
 *
 * Audit entries written before the migration hold a PROVIDER SUBJECT where later ones hold an
 * internal identifier, and `FR-AC-036` says that history is not rewritten — `lib/audit.ts`
 * exports only `record` and `list`, deliberately with no update path, which is what makes the
 * log append-only (011 FR-AD-022). Rewriting it would mean adding one.
 *
 * So the translation happens on the way OUT instead. Without it the audit view shows a raw
 * subject that nobody can tie to a person, which is most of what an audit view is for.
 */
export async function resolveSubjectToAccount(subject: string): Promise<string | null> {
  const account = await Account.findOne({ identities: { $elemMatch: { subject } } })
    .select({ _id: 1 })
    .lean();
  return account ? account._id.toString() : null;
}
