import 'server-only';
import { z } from 'zod';

// ─── Domain enums (data-model.md, D1-D4) ───────────────────────────────────────
export const PIPELINE_STAGES = ['approved', 'in-spec', 'in-review', 'shipped', 'parked'] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

// Forward-only ordinal for the four active stages; 'parked' is terminal (off-ordinal, D3).
export const STAGE_ORDINAL: Record<Exclude<PipelineStage, 'parked'>, number> = {
  approved: 0,
  'in-spec': 1,
  'in-review': 2,
  shipped: 3,
};

export const TRANSITION_ACTIONS = [
  'advance',
  'approve-spec',
  'approve-release',
  'park',
  'reopen',
  'attach-artifact',
] as const;
export type TransitionAction = (typeof TRANSITION_ACTIONS)[number];

export const TRANSITION_ACTORS = ['human', 'session'] as const;
export type TransitionActor = (typeof TRANSITION_ACTORS)[number];

export const ARTIFACT_TYPES = ['draft-spec', 'pull-request'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

// ─── Persisted shapes (data-model.md) ──────────────────────────────────────────
export interface ITransitionLogEntry {
  from: PipelineStage | null; // null only on the seed (promotion) entry
  to: PipelineStage;
  actor: TransitionActor; // audit label, not an identity/permission (D6)
  at: Date;
  isGateApproval: boolean; // set by the endpoint from the action verb — never client-forgeable (D3)
  note?: string;
}

export interface IArtifactLink {
  type: ArtifactType; // 'draft-spec' | 'pull-request'
  ref: string; // a URL / spec-dir path — a REFERENCE only, never content (D7/D11)
  at: Date;
  note?: string;
}

export interface IPipelineItem {
  userId: string; // owner (FR-F-005/018) — every query is scoped to this
  feedbackRecordId: string; // references the source FeedbackRecord (D1)

  // Immutable identity snapshot taken at promotion (D2) — frozen because only completed records promote.
  sourceTitle: string;
  sourceType: 'bug' | 'improvement';
  sourceAffectedArea: string;

  stage: PipelineStage; // denormalized current stage (indexed for the status view)
  parkedFromStage?: PipelineStage; // the active stage held before a park, for reopen (D3)

  promotedBy: string; // = userId, the approving maintainer (FR-F-013)
  promotedAt: Date;

  transitions: ITransitionLogEntry[]; // append-only audit log (FR-F-014)
  artifacts: IArtifactLink[]; // append-only draft-spec / PR links (FR-F-015)

  createdAt: Date;
  updatedAt: Date;
}

// ─── PATCH /pipeline/:id request schema (contracts/dev-loop-api.md, D4) ────────
const actorSchema = z.enum(TRANSITION_ACTORS);
const artifactTypeSchema = z.enum(ARTIFACT_TYPES);

export const transitionRequestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('advance'), actor: actorSchema.optional(), note: z.string().max(500).optional() }),
  z.object({ action: z.literal('approve-spec'), actor: actorSchema.optional(), note: z.string().max(500).optional() }),
  z.object({ action: z.literal('approve-release'), actor: actorSchema.optional(), note: z.string().max(500).optional() }),
  z.object({ action: z.literal('park'), reason: z.string().max(500).optional() }),
  z.object({ action: z.literal('reopen') }),
  z.object({
    action: z.literal('attach-artifact'),
    artifact: z.object({
      type: artifactTypeSchema,
      ref: z.string().min(1).max(2048),
      note: z.string().max(500).optional(),
    }),
  }),
]);

export type TransitionRequest = z.infer<typeof transitionRequestSchema>;

// GET /pipeline query (?stage=)
export const pipelineListQuerySchema = z.object({
  stage: z.enum(PIPELINE_STAGES).optional(),
});
