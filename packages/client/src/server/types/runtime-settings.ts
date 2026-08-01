/**
 * Administrator-adjustable runtime settings (spec 011 FR-AD-026/030).
 *
 * Every key has a **code-owned default**, which is what makes FR-AD-030's third
 * scenario true by construction rather than by seeding: with an empty collection the
 * system behaves exactly as it does today. A stored value is an *override*, never the
 * source of truth for "what happens by default".
 */

export const RUNTIME_SETTING_KEYS = [
  'ai.enabled',
  'recipes.approvedDomains',
  'limits.recommendationsPerMinute',
] as const;

export type RuntimeSettingKey = (typeof RUNTIME_SETTING_KEYS)[number];

export interface RuntimeSettingValues {
  'ai.enabled': boolean;
  'recipes.approvedDomains': string[];
  'limits.recommendationsPerMinute': number;
}

/**
 * The defaults. These MUST mirror the values the code used before spec 011 —
 * `recipes.approvedDomains` is the shipped recipe-verifier allow-list, and the
 * rate limit is the 10/min the recommendations route has always enforced.
 */
export const RUNTIME_SETTING_DEFAULTS: RuntimeSettingValues = {
  'ai.enabled': true,
  'recipes.approvedDomains': [
    'panlasangpinoy.com',
    'recipetineats.com',
    'kawalingpinoy.com',
    'taste.com.au',
  ],
  'limits.recommendationsPerMinute': 10,
};

export interface IRuntimeSetting {
  key: RuntimeSettingKey;
  value: unknown;
  updatedAt: Date;
  updatedBy: string;
}
