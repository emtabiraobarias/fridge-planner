import { ensureOk, apiFetch } from './http';

export type FeedbackType = 'bug' | 'improvement';
export type Priority = 'P1' | 'P2' | 'P3';
export type FeedbackStatus = 'draft' | 'complete' | 'reviewed';
export type AffectedArea =
  | 'inventory'
  | 'meal-plan'
  | 'grocery'
  | 'recommendations'
  | 'auth'
  | 'feedback'
  | 'other';

export interface AcceptanceCriterion {
  given: string;
  when: string;
  then: string;
}

export interface FeedbackMessage {
  role: 'user' | 'agent';
  content: string;
  at: string;
}

/** A feedback record. Structured fields are present only once `status` is `complete`. */
export interface FeedbackRecord {
  _id: string;
  status: FeedbackStatus;
  transcript?: FeedbackMessage[];
  type?: FeedbackType;
  title?: string;
  problemStatement?: string;
  userStory?: string;
  acceptanceCriteria?: AcceptanceCriterion[];
  reproSteps?: string[];
  expectedBehavior?: string;
  actualBehavior?: string;
  affectedArea?: AffectedArea;
  priority?: Priority;
  createdAt: string;
  updatedAt: string;
}

/** The result of a chat turn (start or continue). */
export interface FeedbackTurn {
  feedback: FeedbackRecord;
  status: FeedbackStatus;
  reply: string;
}

const BASE = '/api/v1/feedback';

export async function startFeedback(message: string): Promise<FeedbackTurn> {
  const res = await apiFetch(BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  ensureOk(res, 'start feedback');
  return res.json() as Promise<FeedbackTurn>;
}

export async function sendFeedbackMessage(id: string, message: string): Promise<FeedbackTurn> {
  const res = await apiFetch(`${BASE}/${id}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  ensureOk(res, 'send feedback message');
  return res.json() as Promise<FeedbackTurn>;
}

export async function fetchFeedbackList(status?: FeedbackStatus): Promise<FeedbackRecord[]> {
  const query = status ? `?status=${status}` : '';
  const res = await apiFetch(`${BASE}${query}`);
  ensureOk(res, 'load feedback');
  const data = (await res.json()) as { feedback: FeedbackRecord[] };
  return data.feedback;
}

export async function fetchFeedbackRecord(id: string): Promise<FeedbackRecord> {
  const res = await apiFetch(`${BASE}/${id}`);
  ensureOk(res, 'load feedback record');
  const data = (await res.json()) as { feedback: FeedbackRecord };
  return data.feedback;
}

export async function deleteFeedbackRecord(id: string): Promise<void> {
  const res = await apiFetch(`${BASE}/${id}`, { method: 'DELETE' });
  ensureOk(res, 'delete feedback');
}

/** Fetch the spec-template markdown export for a completed record. */
export async function fetchFeedbackExport(id: string): Promise<string> {
  const res = await apiFetch(`${BASE}/${id}/export`);
  ensureOk(res, 'export feedback');
  return res.text();
}
