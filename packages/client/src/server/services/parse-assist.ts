import 'server-only';
import { z } from 'zod';
import { CATEGORIES, LOCATIONS } from '../models/inventory-item';

/**
 * AI-assisted quick-add interpretation (spec 005 US4, research D6): a single
 * structured-output OpenAI call, field-wise gated to the app's vocabularies
 * (FR-IQ-020) and cached in-memory for 1h per normalised text (FR-IQ-022).
 * No Holodeck, no embeddings — this is a plain classification call.
 */

/** Canonical display units the quick-add parser emits (spec 005 FR-IQ-002). */
export const CANONICAL_UNITS = [
  'count',
  'g',
  'kg',
  'ml',
  'L',
  'pcs',
  'pack',
  'bag',
  'can',
  'bottle',
  'dozen',
  'bunch',
  'jar',
  'loaf',
] as const;

export interface AssistInterpretation {
  name?: string;
  quantity?: number;
  unit?: string;
  category?: string;
  location?: string;
  shelfLifeDays?: number;
}

interface CacheEntry {
  value: AssistInterpretation | null;
  expiresAt: number;
}

// Survive dev hot-reloads, mirroring rate-limit.ts / recommendations-cache.
const globalForCache = globalThis as unknown as { _parseAssistCache?: Map<string, CacheEntry> };
const cache: Map<string, CacheEntry> = (globalForCache._parseAssistCache ??= new Map());
const TTL_MS = 3_600_000; // 1h, per contract

const FIELD_SCHEMAS = {
  name: z.string().min(1).max(100),
  quantity: z.number().positive().max(10_000),
  unit: z.enum(CANONICAL_UNITS),
  category: z.enum(CATEGORIES as unknown as [string, ...string[]]),
  location: z.enum(LOCATIONS as unknown as [string, ...string[]]),
  shelfLifeDays: z.number().int().min(0).max(365),
} as const;

/** Keep each field only if it individually validates — never fail the whole result. */
function gateFieldWise(raw: Record<string, unknown>): AssistInterpretation | null {
  const out: Record<string, unknown> = {};
  for (const [field, schema] of Object.entries(FIELD_SCHEMAS)) {
    const candidate = raw[field];
    if (candidate === undefined || candidate === null) continue;
    const parsed = schema.safeParse(candidate);
    if (parsed.success) out[field] = parsed.data;
  }
  return Object.keys(out).length > 0 ? (out as AssistInterpretation) : null;
}

function systemPrompt(): string {
  return [
    'You classify a short grocery/kitchen item phrase into a JSON object.',
    'Reply with ONLY a JSON object; any field you are unsure of must be omitted.',
    'Fields: name (title-cased item name), quantity (number),',
    `unit (one of: ${CANONICAL_UNITS.join(', ')}),`,
    `category (one of: ${(CATEGORIES as readonly string[]).join(', ')}),`,
    `location (one of: ${(LOCATIONS as readonly string[]).join(', ')}),`,
    'shelfLifeDays (integer 0-365, typical unopened shelf life).',
  ].join(' ');
}

async function callOpenAI(text: string, apiKey: string): Promise<AssistInterpretation | null> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt() },
        { role: 'user', content: text },
      ],
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`OpenAI responded ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;
  try {
    return gateFieldWise(JSON.parse(content) as Record<string, unknown>);
  } catch {
    return null; // junk reply → no interpretation, not an error
  }
}

/** Interpret one low-confidence segment; throws only on upstream failure (→ 503). */
export async function assistedInterpretation(
  text: string,
  apiKey: string,
): Promise<AssistInterpretation | null> {
  const key = text.toLowerCase().replace(/\s+/g, ' ').trim();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await callOpenAI(text, apiKey);
  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}
