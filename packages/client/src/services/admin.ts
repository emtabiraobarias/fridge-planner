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

/** Promote a report into the development pipeline (admin-only, FR-AD-010). */
export async function promoteFeedback(id: string): Promise<void> {
  const res = await apiFetch(`/api/v1/feedback/${id}/promote`, { method: 'POST' });
  ensureOk(res, 'promote the report');
}
