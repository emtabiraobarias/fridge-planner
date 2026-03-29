interface Ingredient {
  name: string;
  quantity: number;
  unit: string;
  expiresAt: string; // ISO 8601
}

interface HolodeckResponse {
  content: string;
  tool_calls: { name: string; status: string }[];
  execution_time_ms: number;
}

export async function getMealRecommendations(ingredients: Ingredient[]): Promise<string> {
  const holodeckUrl = process.env['HOLODECK_URL'];
  if (!holodeckUrl) {
    throw new Error('HOLODECK_URL environment variable is not set');
  }

  const message = [
    'Suggest 3-5 meals I can make with these ingredients.',
    'Prioritise ingredients expiring soonest to minimise food waste.',
    '',
    ...ingredients.map((i) => `- ${i.quantity} ${i.unit} ${i.name} (expires: ${i.expiresAt})`),
  ].join('\n');

  const res = await fetch(`${holodeckUrl}/chat/sync`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    throw new Error(`Holodeck responded with ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as HolodeckResponse;
  return data.content;
}
