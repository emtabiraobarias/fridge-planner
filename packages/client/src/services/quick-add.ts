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
