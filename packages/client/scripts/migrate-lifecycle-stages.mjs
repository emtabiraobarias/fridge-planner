#!/usr/bin/env node
/**
 * One-off migration: spec 012 renamed the pipeline stage `approved` to `accepted`.
 *
 * Spec 012 evolves `pipeline_items` in place rather than adding a collection (research R1),
 * because the old and new stage sets nest almost perfectly — `approved → accepted` is the only
 * value that actually changes. Everything else (`in-spec`, `in-review`, `shipped`, `parked`)
 * carries over untouched, and the rest of the stages are net-new.
 *
 * Run as a ONE-OFF ADMIN TASK (Twelve-Factor XII), never on startup: a migration that runs at
 * boot is invisible when it fails, and this one is trivially re-runnable instead.
 *
 * Idempotent: matches only documents still on the old value, so re-running is a no-op.
 *
 *   MONGODB_URI=mongodb://localhost:27017/fridge-planner \
 *     npm -w packages/client run migrate:lifecycle-stages
 *
 * Plain .mjs rather than TypeScript deliberately — the plan commits to adding no dependency
 * (research R9), and there is no TS runner in this workspace. Mongoose is already a dependency.
 */
import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) {
  console.error('error: MONGODB_URI is not set');
  process.exit(1);
}

const DRY_RUN = process.argv.includes('--dry-run');

try {
  await mongoose.connect(uri);
  const collection = mongoose.connection.collection('pipeline_items');

  const pending = await collection.countDocuments({ stage: 'approved' });
  console.log(`${pending} item(s) on the old \`approved\` stage`);

  if (pending === 0) {
    console.log('nothing to migrate — already up to date');
  } else if (DRY_RUN) {
    console.log(`--dry-run: would set stage='accepted' on ${pending} item(s); nothing written`);
  } else {
    const res = await collection.updateMany({ stage: 'approved' }, { $set: { stage: 'accepted' } });
    console.log(`migrated ${res.modifiedCount} item(s): approved -> accepted`);
  }
} catch (err) {
  console.error('migration failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
