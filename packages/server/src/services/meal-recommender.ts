import type { MealRecommendation } from '../types/meal-recommendation.js';

export interface IngredientInput {
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
  dietaryPreferences: string[] = [],
): Promise<MealRecommendation[]> {
  const holodeckUrl = process.env['HOLODECK_URL'];
  if (!holodeckUrl) {
    throw new Error('HOLODECK_URL environment variable is not set');
  }

  const dietaryNote =
    dietaryPreferences.length > 0
      ? `\nDietary requirements: ${dietaryPreferences.join(', ')}.`
      : '';

  const message = [
    'Suggest 3-5 meals I can make with these ingredients.',
    'Prioritise ingredients expiring soonest to minimise food waste.' + dietaryNote,
    '',
    ...ingredients.map((i) =>
      i.expiresAt
        ? `- ${i.quantity} ${i.unit} ${i.name} (expires: ${i.expiresAt})`
        : `- ${i.quantity} ${i.unit} ${i.name}`,
    ),
  ].join('\n');

  const res = await fetch(`${holodeckUrl}/agent/meal-recommender/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    throw new Error(`Holodeck responded with ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as HolodeckResponse;

  let parsed: unknown;
  try {
    parsed = JSON.parse(data.content);
  } catch {
    throw new Error(`Holodeck returned non-JSON response: ${data.content.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error('Holodeck response was not a JSON array');
  }

  return parsed as MealRecommendation[];
}
