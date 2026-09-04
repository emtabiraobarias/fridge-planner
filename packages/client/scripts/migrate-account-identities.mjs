#!/usr/bin/env node
/**
 * One-off migration: spec 013 moves every user-keyed document off the OIDC `sub`.
 *
 * Until now `userId` throughout the app WAS the identity provider's subject — a value the
 * provider owns, unique only within that provider, and impossible to carry to another one.
 * `accounts._id` replaces it (FR-AC-001/002/006). This script mints one account per distinct
 * subject, records the `(issuer, subject)` link so `authenticate()` resolves to the same
 * place, and rewrites `userId` across every collection keyed by it.
 *
 * Run as a ONE-OFF ADMIN TASK (Twelve-Factor XII, FR-AC-007), never on startup: a migration
 * that runs at boot is invisible when it fails.
 *
 *   MONGODB_URI=… AUTH_ISSUER=… npm -w packages/client run migrate:account-identities -- --check
 *   MONGODB_URI=… AUTH_ISSUER=… npm -w packages/client run migrate:account-identities
 *
 * `--check` reports exactly what the real run would do and writes nothing, so the operator
 * can look before leaping — and can re-run it afterwards to confirm zero remaining work.
 *
 * Idempotent, because the operator will run `--check`, then the real thing, and may re-run
 * after a partial failure. A second pass that re-migrated already-internal ids would mint a
 * second account per user and strand the first one's data.
 *
 * Plain .mjs rather than TypeScript, matching `migrate-lifecycle-stages.mjs`: the plan adds
 * no dependency and there is no TS runner in this workspace.
 */
import mongoose from 'mongoose';

/**
 * Every collection whose documents are keyed by `userId`.
 *
 * ⚠️ This list is the .mjs mirror of `src/server/lib/account-purge.ts`'s model tables, which
 * a script cannot import (they are TypeScript, and pull in `server-only`). CLAUDE.md §5's
 * "adding a seventh means adding a line" rule therefore applies HERE TOO, and the way that
 * rule gets broken is a hardcoded list quietly falling behind the models — so
 * `tests/server/unit/migrate-account-identities.test.ts` asserts this list against the
 * shipped models' own collection names rather than against a literal.
 *
 * `accounterasures` is included deliberately: erasure state keyed by provider subject would
 * stop refusing the moment a second provider is linked, and deleted accounts would come back
 * to life on migration day (FR-AC-038).
 */
export const MIGRATED_COLLECTIONS = Object.freeze([
  'inventoryitems',
  'mealplans',
  'grocerylists',
  'ingredient_aliases',
  'feedbackrecords',
  'pipelineitems',
  'accounterasures',
]);

/**
 * `__erased__` — spec 012's detached-reporter sentinel. Not a person: migrating it would mint
 * an account for it and re-attach detached lifecycle items to a live identity, undoing D15.
 */
const ERASED_REPORTER = '__erased__';

/** Already-internal ids are ObjectId strings that name a real account. */
function looksInternal(value) {
  return /^[0-9a-f]{24}$/i.test(value);
}

/**
 * Migrate in place. Exported so the tests can drive it against an in-memory server; the CLI
 * below is a thin wrapper. Returns a report rather than printing, for the same reason.
 */
export async function migrate(db, { issuer, check = false }) {
  const report = { accountsCreated: 0, documentsRewritten: 0, byCollection: {}, skipped: [] };

  // 1. Every distinct userId still in the data, across all keyed collections.
  const subjects = new Set();
  for (const name of MIGRATED_COLLECTIONS) {
    for (const value of await db.collection(name).distinct('userId')) {
      if (typeof value === 'string' && value !== '' && value !== ERASED_REPORTER) {
        subjects.add(value);
      }
    }
  }

  const accounts = db.collection('accounts');

  // 2. One account per subject, reusing any that already exists.
  //
  // An id that merely LOOKS internal is not enough — a provider subject could be 24 hex
  // characters. It counts as migrated only if an account actually bears it.
  const mapping = new Map();
  for (const subject of subjects) {
    const linked = await accounts.findOne({
      identities: { $elemMatch: { issuer, subject } },
    });
    if (linked) {
      mapping.set(subject, linked._id.toString());
      continue;
    }

    if (looksInternal(subject) && (await accounts.findOne({ _id: new mongoose.Types.ObjectId(subject) }))) {
      continue; // already an internal id — nothing to rewrite
    }

    report.accountsCreated += 1;
    if (check) {
      // Nothing is written, so there is no id to map to. The rewrite pass below still counts
      // the documents this subject owns, which is what the operator needs to see.
      mapping.set(subject, null);
      continue;
    }

    const _id = new mongoose.Types.ObjectId();
    await accounts.insertOne({
      _id,
      displayName: subject,
      identities: [{ issuer, subject, linkedAt: new Date() }],
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    mapping.set(subject, _id.toString());
  }

  // 3. Rewrite. Per (collection, subject) so the counts are per-collection: "412 documents"
  //    hides which store did not move when something goes wrong halfway.
  for (const name of MIGRATED_COLLECTIONS) {
    report.byCollection[name] = 0;
    for (const [subject, internalId] of mapping) {
      if (check) {
        report.byCollection[name] += await db.collection(name).countDocuments({ userId: subject });
        continue;
      }
      const res = await db
        .collection(name)
        .updateMany({ userId: subject }, { $set: { userId: internalId } });
      report.byCollection[name] += res.modifiedCount ?? 0;
    }
    report.documentsRewritten += report.byCollection[name];
  }

  return report;
}

// ——— CLI ———
// Guarded so importing this module from a test does not run a migration.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  const uri = process.env.MONGODB_URI;
  const issuer = process.env.AUTH_ISSUER;
  if (!uri) {
    console.error('error: MONGODB_URI is not set');
    process.exit(1);
  }
  if (!issuer) {
    // Without it the recorded pair would not match the one `authenticate()` builds from the
    // token, and every migrated user would be handed a brand-new empty account on next
    // sign-in. Refusing beats guessing.
    console.error('error: AUTH_ISSUER is not set — it is half of the identity key');
    process.exit(1);
  }

  const check = process.argv.includes('--check');
  try {
    await mongoose.connect(uri);
    const report = await migrate(mongoose.connection.db, { issuer, check });

    console.log(check ? '--check: nothing was written' : 'migration applied');
    console.log(`  accounts ${check ? 'that would be created' : 'created'}: ${report.accountsCreated}`);
    for (const [name, count] of Object.entries(report.byCollection)) {
      console.log(`  ${name}: ${count}`);
    }
    if (report.documentsRewritten === 0 && report.accountsCreated === 0) {
      console.log('nothing to migrate — already up to date');
    }
  } catch (err) {
    console.error('migration failed:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}
