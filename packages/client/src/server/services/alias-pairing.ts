import 'server-only';
import { IngredientAlias } from '../models/ingredient-alias';
import { normalizeIngredientName } from '../lib/ingredient-matcher';
import { logger } from '../logger';

/**
 * Tier-3 ingredient↔inventory pairing (spec 006 research D3): a per-user learned
 * mapping in `ingredient_aliases.inventoryName`, backfilled by a single cached
 * gpt-4o-mini structured-output call when unknown. Fail-open: any error, missing
 * key, or non-match yields null — a pairing can never block a suggestion or a
 * cook (FR-MC-004). No embeddings (CLAUDE.md §14).
 */

interface CacheEntry {
  value: string | null;
  expiresAt: number;
}

// Survive dev hot-reloads, mirroring parse-assist / recommendations-cache.
const globalForCache = globalThis as unknown as { _aliasPairingCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (globalForCache._aliasPairingCache ??= new Map());
const TTL_MS = 3_600_000; // 1h

/**
 * Resolve an ingredient name to one of the user's inventory item names, or null.
 * Order: stored pairing → LLM lookup (persisted on success) → null.
 */
export async function lookupPairing(
  userId: string,
  ingredientName: string,
  inventoryNames: string[],
): Promise<string | null> {
  const nameKey = normalizeIngredientName(ingredientName);
  if (!nameKey) return null;

  const cacheKey = `${userId}:${nameKey}`;
  const hit = cache.get(cacheKey);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  try {
    const value = await resolveUncached(userId, nameKey, inventoryNames);
    cache.set(cacheKey, { value, expiresAt: Date.now() + TTL_MS });
    return value;
  } catch (err) {
    // Fail-open and UNcached, so a transient failure can retry later.
    logger.warn({ err }, 'alias-pairing: lookup failed (fail-open)');
    return null;
  }
}

async function resolveUncached(
  userId: string,
  nameKey: string,
  inventoryNames: string[],
): Promise<string | null> {
  const alias = await IngredientAlias.findOne({ userId, nameKey });
  if (alias?.inventoryName) return alias.inventoryName;

  const apiKey = process.env['OPENAI_API_KEY'];
  if (!apiKey || inventoryNames.length === 0) return null;

  const match = await askModel(nameKey, inventoryNames, apiKey);
  if (match) {
    await IngredientAlias.findOneAndUpdate(
      { userId, nameKey },
      { $set: { inventoryName: match } },
      { upsert: true },
    );
  }
  return match;
}

async function askModel(
  ingredient: string,
  inventoryNames: string[],
  apiKey: string,
): Promise<string | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 60,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Given a recipe ingredient and a list of kitchen inventory item names, reply with ' +
            'ONLY a JSON object {"match": "<one name from the list>"} when the ingredient clearly ' +
            'refers to one of the items, or {"match": null} when none applies. Never invent names.',
        },
        {
          role: 'user',
          content: `Ingredient: ${ingredient}\nInventory: ${inventoryNames.join(', ')}`,
        },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`OpenAI responded ${res.status}`);

  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  let candidate: unknown;
  try {
    candidate = (JSON.parse(content) as { match?: unknown }).match;
  } catch {
    return null; // junk reply → no pairing, not an error
  }
  if (typeof candidate !== 'string') return null;

  // Gate to the actual vocabulary: the reply must be one of the provided names.
  const lower = candidate.trim().toLowerCase();
  return inventoryNames.find((n) => n.toLowerCase() === lower) ?? null;
}
