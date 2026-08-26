import { ensureOk, apiFetch } from './http';

/**
 * Browser fetch wrappers for the administration surface (spec 011).
 *
 * Like every other service module this talks to the API only — it never imports
 * `src/server/*` (CLAUDE.md §14). A 403 from any of these means the caller is not an
 * administrator; the UI treats that as "not available", never as a broken session
 * (which is what a 401 would mean — see research D3).
 */

export interface Me {
  userId: string;
  isAdmin: boolean;
}

export type AdminFeedbackStatus = 'draft' | 'complete' | 'reviewed';

export interface AdminFeedbackRow {
  _id: string;
  userId: string;
  status: AdminFeedbackStatus;
  title?: string;
  type?: string;
  affectedArea?: string;
  priority?: string;
  /** The reporter's opening line — how a title-less draft is identified in triage. */
  excerpt?: string;
  pipelineStage: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface AdminFeedbackDetail extends AdminFeedbackRow {
  transcript: Array<{ role: 'user' | 'agent'; content: string; at: string }>;
  problemStatement?: string;
  expectedBehavior?: string;
  actualBehavior?: string;
}

export interface AuditEntry {
  adminUserId: string;
  action: string;
  subjectUserId?: string;
  subjectType?: string;
  subjectId?: string;
  at: string;
}

/** Who am I, and may I administer? Never throws on 403 — it simply cannot happen here. */
export async function fetchMe(): Promise<Me> {
  const res = await apiFetch('/api/v1/me');
  return (await ensureOk(res, 'load your profile').json()) as Me;
}

export interface AdminFeedbackQuery {
  status?: AdminFeedbackStatus;
  userId?: string;
}

export async function fetchAdminFeedback(
  query: AdminFeedbackQuery = {},
): Promise<AdminFeedbackRow[]> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.userId) params.set('userId', query.userId);
  const qs = params.toString();
  const res = await apiFetch(`/api/v1/admin/feedback${qs ? `?${qs}` : ''}`);
  const data = (await ensureOk(res, 'load feedback').json()) as { feedback: AdminFeedbackRow[] };
  return data.feedback;
}

export async function fetchAdminFeedbackDetail(id: string): Promise<AdminFeedbackDetail> {
  const res = await apiFetch(`/api/v1/admin/feedback/${id}`);
  const data = (await ensureOk(res, 'load the report').json()) as { feedback: AdminFeedbackDetail };
  return data.feedback;
}

export async function fetchAuditLog(subjectUserId?: string): Promise<AuditEntry[]> {
  const qs = subjectUserId ? `?subjectUserId=${encodeURIComponent(subjectUserId)}` : '';
  const res = await apiFetch(`/api/v1/admin/audit${qs}`);
  const data = (await ensureOk(res, 'load the audit trail').json()) as { entries: AuditEntry[] };
  return data.entries;
}

export interface UserSupportView {
  userId: string;
  counts: { inventoryItems: number; mealPlans: number; groceryLists: number };
  inventory: Array<{
    _id: string;
    name: string;
    quantity: number;
    unit: string;
    location: string;
    expirationStatus: string;
  }>;
  mealPlans: Array<{ _id: string; weekStart: string }>;
  groceryLists: Array<{ _id: string; weekStart: string; items: unknown[] }>;
}

/** Read-only support view of one user's kitchen (admin-only, FR-AD-015). */
export async function fetchUserData(userId: string): Promise<UserSupportView> {
  const res = await apiFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/data`);
  return (await ensureOk(res, 'load that user\u2019s data').json()) as UserSupportView;
}

/** Promote a report into the development pipeline (admin-only, FR-AD-010). */
export async function promoteFeedback(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/feedback/${id}/promote`, { method: 'POST' });
  ensureOk(res, 'promote the report');
}

/* ── US4: operational visibility & control (FR-AD-024..030) ──────────────────
 *
 * These mirror `src/server/lib/health-checks.ts`, `rate-limit.ts` and
 * `types/runtime-settings.ts` by hand rather than importing them: a browser module may
 * never reach into `src/server/*` (CLAUDE.md §14), and importing a `server-only` module
 * from here fails the build. The duplication is deliberate and small.
 */

export type DependencyStatus = 'ok' | 'degraded' | 'down' | 'not-configured';

export interface DependencyReport {
  name: string;
  status: DependencyStatus;
}

export interface ReadinessReport {
  ready: boolean;
  version: string;
  dependencies: DependencyReport[];
}

/**
 * Readiness (FR-AD-024/025). Unauthenticated like its sibling `/api/health`, and it
 * answers **503 when not ready** — which is the interesting case, so this deliberately
 * does not go through `ensureOk`: a not-ready report is a successful read of a bad
 * state, not a failed request.
 */
export async function fetchReadiness(): Promise<ReadinessReport> {
  const res = await apiFetch('/api/health/ready');
  if (res.status !== 200 && res.status !== 503) {
    return ensureOk(res, 'load readiness').json() as Promise<ReadinessReport>;
  }
  return (await res.json()) as ReadinessReport;
}

export interface RuntimeSettings {
  'ai.enabled': boolean;
  'recipes.approvedDomains': string[];
  'limits.recommendationsPerMinute': number;
}

export async function fetchSettings(): Promise<RuntimeSettings> {
  const res = await apiFetch('/api/v1/admin/settings');
  const data = (await ensureOk(res, 'load settings').json()) as { settings: RuntimeSettings };
  return data.settings;
}

/** Apply overrides. The server validates all-or-nothing, so a rejection changes nothing. */
export async function patchSettings(patch: Partial<RuntimeSettings>): Promise<RuntimeSettings> {
  const res = await apiFetch('/api/v1/admin/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const data = (await ensureOk(res, 'update settings').json()) as { settings: RuntimeSettings };
  return data.settings;
}

export interface UsageRow {
  day: string;
  feature: string;
  count: number;
}

export async function fetchUsage(): Promise<UsageRow[]> {
  const res = await apiFetch('/api/v1/admin/usage');
  const data = (await ensureOk(res, 'load AI usage').json()) as { usage: UsageRow[] };
  return data.usage;
}

/** Flush cached AI results — everything, or one user's slice (FR-AD-028). */
export async function flushCache(userId?: string): Promise<string> {
  const qs = userId ? `?userId=${encodeURIComponent(userId)}` : '';
  const res = await apiFetch(`/api/v1/admin/cache${qs}`, { method: 'DELETE' });
  const data = (await ensureOk(res, 'flush the cache').json()) as { flushed: string };
  return data.flushed;
}

export interface LimiterBucketView {
  key: string;
  count: number;
  resetsAt: number;
}

export async function fetchLimits(): Promise<LimiterBucketView[]> {
  const res = await apiFetch('/api/v1/admin/limits');
  const data = (await ensureOk(res, 'load rate limits').json()) as { buckets: LimiterBucketView[] };
  return data.buckets;
}

/** Release a user throttled in error (FR-AD-029). */
export async function resetLimit(key: string): Promise<boolean> {
  const res = await apiFetch(`/api/v1/admin/limits/${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  const data = (await ensureOk(res, 'reset that limit').json()) as { cleared: boolean };
  return data.cleared;
}

/* ── US6: account export & two-phase erasure (FR-AD-017..020) ─────────────── */

export interface AccountExport {
  userId: string;
  exportedAt: string;
  collections: string[];
  data: Record<string, unknown[]>;
}

export async function exportUser(userId: string): Promise<AccountExport> {
  const res = await apiFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/export`);
  return (await ensureOk(res, 'export that account').json()) as AccountExport;
}

export interface ErasureResult {
  userId: string;
  erasedAt: string;
  purgeAfter: string;
  recoverableForDays: number;
}

/** Begin the two-phase erasure. Reversible until `purgeAfter` (FR-AD-018/019). */
export async function eraseUser(userId: string): Promise<ErasureResult> {
  const res = await apiFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/erase`, {
    method: 'POST',
  });
  return (await ensureOk(res, 'erase that account').json()) as ErasureResult;
}

export async function restoreUser(userId: string): Promise<{ userId: string; restoredAt: string }> {
  const res = await apiFetch(`/api/v1/admin/users/${encodeURIComponent(userId)}/restore`, {
    method: 'POST',
  });
  return (await ensureOk(res, 'restore that account').json()) as {
    userId: string;
    restoredAt: string;
  };
}

export interface PurgeResult {
  purged: Array<{ userId: string; counts: Record<string, number> }>;
  count: number;
}

/** Run the purge sweep for every erasure whose recovery window has elapsed. */
export async function purgeExpired(): Promise<PurgeResult> {
  const res = await apiFetch('/api/v1/admin/users/purge', { method: 'POST' });
  return (await ensureOk(res, 'run the purge').json()) as PurgeResult;
}
