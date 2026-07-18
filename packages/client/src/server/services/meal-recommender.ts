import type { MealRecommendation } from '../types/meal-recommendation';

export interface IngredientInput {
  /** Inventory item id — echoed back by the agent as a grounded reference (spec 006). */
  id?: string;
  name: string;
  quantity: number;
  unit: string;
  expiresAt?: string; // ISO 8601
}

interface HolodeckResponse {
  content: string;
  session_id: string;
  tool_calls: { name: string; status: string }[];
  tokens_used: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
  execution_time_ms: number;
}

export async function getMealRecommendations(
  ingredients: IngredientInput[],
  excludeMealNames: string[] = [],
): Promise<MealRecommendation[]> {
  const holodeckUrl = process.env['HOLODECK_URL'];
  if (!holodeckUrl) {
    throw new Error('HOLODECK_URL environment variable is not set');
  }

  const message = [
    // FR-014: 5-10 candidate net — enough meals survive the client-side removal of
    // any whose recipe link can't be verified (FR-037 lazy phase).
    'Suggest 5-10 meals I can make with these ingredients.',
    'Prioritise ingredients expiring soonest to minimise food waste.',
    // FR-037 top-up round: steer the agent away from meals already suggested this
    // request, and toward conventionally named dishes — common names are what the
    // recipe-verifier's title search matches, so the retry round converts far better.
    ...(excludeMealNames.length > 0
      ? [
          `Do NOT suggest any of these meals (or close variations): ${excludeMealNames.join(', ')}.`,
          'Prefer well-known dishes with common, conventional names (e.g. classic Filipino or Western recipes) rather than inventive combinations.',
        ]
      : []),
    '',
    ...ingredients.map((i) => {
      // Spec 006: expose the item id so the agent can return grounded references.
      const idTag = i.id ? `[id:${i.id}] ` : '';
      return i.expiresAt
        ? `- ${idTag}${i.quantity} ${i.unit} ${i.name} (expires: ${i.expiresAt})`
        : `- ${idTag}${i.quantity} ${i.unit} ${i.name}`;
    }),
  ].join('\n');

  const res = await fetch(`${holodeckUrl}/agent/meal-recommender/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
    // 220 s — under the 240 s Next.js proxy ceiling so Express can return a proper error.
    signal: AbortSignal.timeout(220_000),
  });

  if (!res.ok) {
    throw new Error(`Holodeck responded with ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as HolodeckResponse;
  return parseMealArray(data.content);
}

/**
 * Parse the agent's `content` into a MealRecommendation array. The model is told to
 * return raw JSON, but LLMs occasionally wrap it in a ```json markdown fence (or add
 * stray text) — tolerate that rather than falling back, since the payload is valid.
 */
function parseMealArray(content: string): MealRecommendation[] {
  let text = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '') // strip a leading ```json / ``` fence
    .replace(/\s*```$/, '') // strip the trailing ```
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Last resort: extract the outermost JSON array from surrounding prose.
    const start = text.indexOf('[');
    const end = text.lastIndexOf(']');
    if (start === -1 || end <= start) {
      throw new Error(`Holodeck returned non-JSON response: ${content.slice(0, 200)}`);
    }
    parsed = JSON.parse(text.slice(start, end + 1));
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Holodeck response was not a JSON array');
  }
  return parsed as MealRecommendation[];
}
