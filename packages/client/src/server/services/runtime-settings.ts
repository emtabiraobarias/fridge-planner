import 'server-only';
import mongoose from 'mongoose';
import { z } from 'zod';
import { RuntimeSetting } from '../models/runtime-setting';
import {
  RUNTIME_SETTING_DEFAULTS,
  RUNTIME_SETTING_KEYS,
  type RuntimeSettingKey,
  type RuntimeSettingValues,
} from '../types/runtime-settings';

/**
 * Effective runtime settings (spec 011 FR-AD-026/030), read on the hot path.
 *
 * Effective value = stored override ?? code default. Because the defaults live in code
 * (`types/runtime-settings.ts`), an **empty collection reproduces today's behaviour
 * exactly** — which is what makes "no override ever set → behaves as today" true by
 * construction instead of by seeding a database.
 *
 * Cached in-process for a short TTL so a per-request read costs nothing. Single
 * instance today, consistent with the existing in-memory rate limiter and
 * recommendations cache; the same multi-instance caveat as those applies (Phase E5).
 */

const CACHE_TTL_MS = 10_000;

interface CacheEntry {
  values: Partial<RuntimeSettingValues>;
  at: number;
}
const globalForSettings = globalThis as unknown as { _runtimeSettings?: CacheEntry };

/** Per-key validation. An invalid write is rejected and the prior value stands. */
export const RUNTIME_SETTING_SCHEMAS: { [K in RuntimeSettingKey]: z.ZodType } = {
  'ai.enabled': z.boolean(),
  'recipes.approvedDomains': z.array(z.string().min(3).max(253)).max(20),
  'limits.recommendationsPerMinute': z.number().int().positive().max(1000),
};

async function loadOverrides(): Promise<Partial<RuntimeSettingValues>> {
  const cached = globalForSettings._runtimeSettings;
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.values;

  // No connection → code defaults, immediately. Without this the query is BUFFERED by
  // mongoose and the caller hangs until the buffer timeout — and since this sits on the
  // hot path of every AI call (via `ai-guard`), that turned four DB-free service unit
  // suites into 5s timeouts the moment the kill switch was wired in. It is also the
  // right production behaviour: if settings are unreadable, the shipped defaults are
  // the safe answer, not a stalled request.
  if (mongoose.connection.readyState !== 1) return {};

  const values: Partial<RuntimeSettingValues> = {};
  try {
    for (const doc of await RuntimeSetting.find({}).lean()) {
      // A stored value that no longer validates (schema tightened since it was written)
      // is ignored rather than trusted — the code default is always safe.
      const schema = RUNTIME_SETTING_SCHEMAS[doc.key];
      if (schema?.safeParse(doc.value).success) {
        (values as Record<string, unknown>)[doc.key] = doc.value;
      }
    }
  } catch (err) {
    // Never let a settings read break a user request: fall back to defaults.
    console.error('[runtime-settings] load failed, using defaults', err);
  }

  globalForSettings._runtimeSettings = { values, at: Date.now() };
  return values;
}

/** The effective value for one key. */
export async function getSetting<K extends RuntimeSettingKey>(
  key: K,
): Promise<RuntimeSettingValues[K]> {
  const overrides = await loadOverrides();
  return (overrides[key] ?? RUNTIME_SETTING_DEFAULTS[key]) as RuntimeSettingValues[K];
}

/** Every effective value, for the admin settings screen. */
export async function getAllSettings(): Promise<RuntimeSettingValues> {
  const overrides = await loadOverrides();
  return { ...RUNTIME_SETTING_DEFAULTS, ...overrides };
}

/** True when AI-dependent features may call a paid model (FR-AD-026 kill switch). */
export async function aiEnabled(): Promise<boolean> {
  return getSetting('ai.enabled');
}

export interface SettingUpdateResult {
  ok: boolean;
  error?: string;
}

/** Apply an override. Rejects an invalid value, leaving the prior value in force. */
export async function setSetting(
  key: string,
  value: unknown,
  updatedBy: string,
): Promise<SettingUpdateResult> {
  if (!(RUNTIME_SETTING_KEYS as readonly string[]).includes(key)) {
    return { ok: false, error: `Unknown setting "${key}"` };
  }
  const parsed = RUNTIME_SETTING_SCHEMAS[key as RuntimeSettingKey].safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues.map((i) => i.message).join('; ') };
  }

  await RuntimeSetting.findOneAndUpdate(
    { key },
    { $set: { value: parsed.data, updatedAt: new Date(), updatedBy } },
    { upsert: true },
  );
  invalidateSettingsCache();
  return { ok: true };
}

/** Drop the in-process cache so the next read reflects a just-written override. */
export function invalidateSettingsCache(): void {
  delete globalForSettings._runtimeSettings;
}
