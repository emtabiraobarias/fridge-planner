import 'server-only';
import mongoose, { type Document, type Model, Schema } from 'mongoose';
import type { IArtifactLink, IPipelineItem, ITransitionLogEntry } from '../types/pipeline';
import { ARTIFACT_TYPES, PIPELINE_STAGES, TRANSITION_ACTORS } from '../types/pipeline';

export type PipelineItemDocument = IPipelineItem & Document;

const transitionLogEntrySchema = new Schema<ITransitionLogEntry>(
  {
    from: { type: String, enum: PIPELINE_STAGES, default: null },
    to: { type: String, required: true, enum: PIPELINE_STAGES },
    actor: { type: String, required: true, enum: TRANSITION_ACTORS },
    at: { type: Date, required: true, default: Date.now },
    isGateApproval: { type: Boolean, required: true, default: false },
    note: { type: String },
  },
  { _id: false },
);

const artifactLinkSchema = new Schema<IArtifactLink>(
  {
    type: { type: String, required: true, enum: ARTIFACT_TYPES },
    ref: { type: String, required: true, maxlength: 2048 },
    at: { type: Date, required: true, default: Date.now },
    note: { type: String },
  },
  { _id: false },
);

const pipelineItemSchema = new Schema<IPipelineItem>(
  {
    userId: { type: String, required: true, index: true },
    feedbackRecordId: { type: String, required: true },

    sourceTitle: { type: String, required: true },
    sourceType: { type: String, required: true, enum: ['bug', 'improvement'] },
    sourceAffectedArea: { type: String, required: true },

    stage: { type: String, required: true, enum: PIPELINE_STAGES },
    parkedFromStage: { type: String, enum: PIPELINE_STAGES },

    promotedBy: { type: String, required: true },
    promotedAt: { type: Date, required: true, default: Date.now },

    transitions: { type: [transitionLogEntrySchema], default: [] },
    artifacts: { type: [artifactLinkSchema], default: [] },
  },
  { timestamps: true },
);

// Enforces idempotent promotion (FR-F-013) at the DB layer — a second promote hits
// the existing item (D1).
pipelineItemSchema.index({ userId: 1, feedbackRecordId: 1 }, { unique: true });
// Serves the owner-scoped status view + ?stage= filter (FR-F-015, D8).
pipelineItemSchema.index({ userId: 1, stage: 1 });
// Recency ordering for the list view.
pipelineItemSchema.index({ userId: 1, updatedAt: -1 });

// Reuse the compiled model across Next.js dev hot-reloads (avoids OverwriteModelError),
// identical to feedback-record.ts's guard.
export const PipelineItem: Model<IPipelineItem> =
  (mongoose.models['PipelineItem'] as Model<IPipelineItem> | undefined) ??
  mongoose.model<IPipelineItem>('PipelineItem', pipelineItemSchema);
