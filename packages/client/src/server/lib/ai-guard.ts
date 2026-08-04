import 'server-only';
import mongoose from 'mongoose';
import { AiUsageCounter, type AiFeature } from '../models/ai-usage-counter';
import { aiEnabled } from '../services/runtime-settings';

/**
 * The single gate every paid-model call passes through (spec 011 FR-AD-026/027).
 *
 * Kill switch and usage counting live together deliberately: a call that is blocked is
 * by construction a call that is not counted, so the two can never drift apart and
 * report contradictory things.
 *
 * Placed at the SERVICE boundary rather than in controllers, so every current and
 * future caller inherits it — and each of those services already has a graceful no-AI
 * fallback to degrade into, which is what FR-AD-026 requires instead of an error.
 */

/** UTC-midnight day key, same axis as `rolling-grocery`'s cutoff. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Fire-and-forget: usage accounting must never fail or slow a user's request. */
function countCall(feature: AiFeature): void {
  // Same reason as runtime-settings: with no connection mongoose buffers the write and
  // the promise never settles. Usage accounting is best-effort, never a blocker.
  if (mongoose.connection.readyState !== 1) return;
  void AiUsageCounter.updateOne({ day: today(), feature }, { $inc: { calls: 1 } }, { upsert: true })
    .exec()
    .catch((err: unknown) => console.error('[ai-guard] usage count failed', { feature, err }));
}

/**
 * Run `call` only if AI is enabled; otherwise return `fallback` **without** making the
 * request. An in-flight call is never aborted — the switch stops new calls starting
 * (spec edge case).
 */
export async function withAiGuard<T>(
  feature: AiFeature,
  call: () => Promise<T>,
  fallback: () => T | Promise<T>,
): Promise<T> {
  if (!(await aiEnabled())) return fallback();
  countCall(feature);
  return call();
}

/** For call sites whose fallback is structural rather than a value. */
export async function aiAllowed(feature: AiFeature): Promise<boolean> {
  if (!(await aiEnabled())) return false;
  countCall(feature);
  return true;
}
