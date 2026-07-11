import { z } from 'zod';

// ─── Domain enums ──────────────────────────────────────────────────────────────
export const FEEDBACK_TYPES = ['bug', 'improvement'] as const;
export type FeedbackType = (typeof FEEDBACK_TYPES)[number];

export const PRIORITIES = ['P1', 'P2', 'P3'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const AFFECTED_AREAS = [
  'inventory',
  'meal-plan',
  'grocery',
  'recommendations',
  'auth',
  'feedback',
  'other',
] as const;
export type AffectedArea = (typeof AFFECTED_AREAS)[number];

export const FEEDBACK_STATUSES = ['draft', 'complete', 'reviewed'] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export const MESSAGE_ROLES = ['user', 'agent'] as const;
export type MessageRole = (typeof MESSAGE_ROLES)[number];

// ─── Persisted shapes ──────────────────────────────────────────────────────────
export interface IAcceptanceCriterion {
  given: string;
  when: string;
  then: string;
}

export interface IFeedbackMessage {
  role: MessageRole;
  content: string;
  at: Date;
}

/** The structured, spec-shaped fields of a completed record (FR-F-003). */
export interface IStructuredRecord {
  type: FeedbackType;
  title: string;
  problemStatement: string;
  userStory: string;
  acceptanceCriteria: IAcceptanceCriterion[];
  reproSteps: string[];
  expectedBehavior: string;
  actualBehavior: string;
  affectedArea: AffectedArea;
  priority: Priority;
}

export interface IFeedbackRecord extends Partial<IStructuredRecord> {
  userId: string;
  status: FeedbackStatus;
  transcript: IFeedbackMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// ─── Agent protocol schemas (shared by the service + controller) ────────────────
const acceptanceCriterionSchema = z.object({
  given: z.string().min(1),
  when: z.string().min(1),
  then: z.string().min(1),
});

/**
 * Validate the agent's `record` before it is persisted as complete (FR-F-004). Bugs
 * additionally require reproduction steps and expected-vs-actual behaviour (FR-F-003);
 * "[unknown]" placeholders (emitted under FINALIZE) satisfy the min-length checks.
 */
export const structuredRecordSchema = z
  .object({
    type: z.enum(FEEDBACK_TYPES),
    title: z.string().min(1).max(120),
    problemStatement: z.string().min(1),
    userStory: z.string().min(1),
    acceptanceCriteria: z.array(acceptanceCriterionSchema).min(1),
    reproSteps: z.array(z.string().min(1)),
    expectedBehavior: z.string(),
    actualBehavior: z.string(),
    affectedArea: z.enum(AFFECTED_AREAS),
    priority: z.enum(PRIORITIES),
  })
  .superRefine((rec, ctx) => {
    if (rec.type === 'bug') {
      if (rec.reproSteps.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reproSteps'], message: 'reproSteps required for a bug' });
      }
      if (rec.expectedBehavior.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expectedBehavior'], message: 'expectedBehavior required for a bug' });
      }
      if (rec.actualBehavior.trim() === '') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['actualBehavior'], message: 'actualBehavior required for a bug' });
      }
    }
  });

export const collectingReplySchema = z.object({
  status: z.literal('collecting'),
  reply: z.string().min(1),
  missing: z.array(z.string()).default([]),
});

export const completeReplySchema = z.object({
  status: z.literal('complete'),
  reply: z.string().min(1),
  record: structuredRecordSchema,
});

/** The single object the agent returns each turn. */
export const agentReplySchema = z.discriminatedUnion('status', [
  collectingReplySchema,
  completeReplySchema,
]);

export type CollectingReply = z.infer<typeof collectingReplySchema>;
export type CompleteReply = z.infer<typeof completeReplySchema>;
export type AgentReply = z.infer<typeof agentReplySchema>;
export type StructuredRecordInput = z.infer<typeof structuredRecordSchema>;
