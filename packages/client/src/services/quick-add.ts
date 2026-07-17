import { ensureOk, apiFetch } from './http';

const BASE = '/api/v1/quick-add';

export interface QuickAddAlias {
  nameKey: string;
  category?: string;
  location?: string;
  unit?: string;
  suggestedShelfLifeDays?: number;
}

export interface AliasPatch {
  category?: string;
  location?: string;
  unit?: string;
  observedShelfLifeDays?: number;
}

export async function getAliases(): Promise<QuickAddAlias[]> {
  const res = await apiFetch(`${BASE}/aliases`);
  ensureOk(res, 'fetch quick-add aliases');
  const data = (await res.json()) as { aliases: QuickAddAlias[] };
  return data.aliases;
}

export async function putAlias(nameKey: string, patch: AliasPatch): Promise<void> {
  const res = await apiFetch(`${BASE}/aliases/${encodeURIComponent(nameKey)}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  ensureOk(res, 'save quick-add alias');
}

export interface AssistInterpretation {
  name?: string;
  quantity?: number;
  unit?: string;
  category?: string;
  location?: string;
  shelfLifeDays?: number;
}

/** AI-assisted interpretation of a low-confidence segment (spec 005 US4). Throws on any non-200 — callers fail open. */
export async function assistParse(text: string): Promise<AssistInterpretation | null> {
  const res = await apiFetch(`${BASE}/parse`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  ensureOk(res, 'assist quick-add parse');
  const data = (await res.json()) as { interpretation: AssistInterpretation | null };
  return data.interpretation;
}
