import 'server-only';
import mongoose, { type Model, Schema } from 'mongoose';
import { LIFECYCLE_STAGES } from '../lib/lifecycle-stages';
import {
  ARTIFACT_TYPES,
  CLAUSE_VETTING_STATES,
  DISMISSAL_REASONS,
  TRANSITION_ACTORS,
  type IArtifactLink,
  type IClause,
  type IClosureRecord,
  type ILifecycleItem,
  type IMaintainerReply,
  type ITransitionLogEntry,
} from '../types/lifecycle';

/**
 * Spec 012's lifecycle item — the SAME collection the pipeline items already live in.
 *
 * The model renames, the collection does not (research R1) — and the collection is
 * `pipelineitems`, Mongoose's default pluralisation of the old model name. The stage sets nest
 * almost perfectly: only `approved` changed, to `accepted`, migrated once by
 * `scripts/migrate-lifecycle-stages.mjs`. A second collection would have bought dual-write, a
 * join on every maintainer view, and two answers to "what stage is this in".
 */

const transitionLogEntrySchema = new Schema<ITransitionLogEntry>(
  {
    from: { type: String, enum: LIFECYCLE_STAGES, default: null },
    to: { type: String, required: true, enum: LIFECYCLE_STAGES },
    actor: { type: String, required: true, enum: TRANSITION_ACTORS },
    actorUserId: { type: String },
    at: { type: Date, required: true, default: Date.now },
    isGateApproval: { type: Boolean, required: true, default: false },
    note: { type: String },
  },
  { _id: false },
);

const clauseSchema = new Schema<IClause>(
  {
    provisionalId: { type: String, required: true },
    text: { type: String, required: true },
    // REQUIRED, not optional — FR-FL-025 makes vetting a comparison, and a clause with nothing
    // to compare against silently becomes a proofread.
    derivedFrom: { type: String, required: true },
    inferred: { type: Boolean, required: true, default: false },
    vetted: { type: String, required: true, enum: CLAUSE_VETTING_STATES, default: 'pending' },
    editedText: { type: String },
    vettedBy: { type: String },
    vettedAt: { type: Date },
  },
  { _id: false },
);

const closureSchema = new Schema<IClosureRecord>(
  {
    excerpt: { type: String, required: true },
    releaseTag: { type: String },
    releaseUrl: { type: String },
    releaseFallbackText: { type: String },
    unavailableReason: { type: String },
    closedBy: { type: String, required: true },
    closedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const replySchema = new Schema<IMaintainerReply>(
  {
    text: { type: String, required: true },
    byUserId: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
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

const lifecycleItemSchema = new Schema<ILifecycleItem>(
  {
    userId: { type: String, required: true, index: true },
    feedbackRecordId: { type: String, required: true },

    sourceTitle: { type: String, required: true },
    sourceType: { type: String, required: true, enum: ['bug', 'improvement'] },
    sourceAffectedArea: { type: String, required: true },

    stage: { type: String, required: true, enum: LIFECYCLE_STAGES },
    parkedFromStage: { type: String, enum: LIFECYCLE_STAGES },
    rank: { type: Number },

    dismissalReason: { type: String, enum: DISMISSAL_REASONS },
    mergedInto: { type: String },
    cites: { type: [String], default: undefined },

    acceptedBy: { type: String },
    acceptedAt: { type: Date },

    transitions: { type: [transitionLogEntrySchema], default: [] },
    clauses: { type: [clauseSchema], default: [] },
    reply: { type: replySchema },
    closure: { type: closureSchema },
    artifacts: { type: [artifactLinkSchema], default: [] },

    reporterErasedAt: { type: Date },
  },
  // `pipelineitems`, not `pipeline_items`: the shipped PipelineItem model set no explicit
  // collection, so Mongoose's default pluralisation is what production actually holds. Naming it
  // explicitly here stops the two models drifting onto different collections.
  { timestamps: true, collection: 'pipelineitems' },
);

// One item per record, enforced in the DATABASE — this is what makes acceptance idempotent
// under concurrency, rather than a controller check two requests can both pass.
lifecycleItemSchema.index({ userId: 1, feedbackRecordId: 1 }, { unique: true });
// The reporter's own view.
lifecycleItemSchema.index({ userId: 1, stage: 1 });
lifecycleItemSchema.index({ userId: 1, updatedAt: -1 });
// The maintainer's cross-user triage queue, which is deliberately NOT user-scoped (FR-FL-023).
lifecycleItemSchema.index({ stage: 1, updatedAt: -1 });

// Reused across Next dev hot-reloads to avoid OverwriteModelError. Schema edits therefore need a
// dev-server restart — the model is cached, not re-read (CLAUDE.md §13).
export const LifecycleItem: Model<ILifecycleItem> =
  (mongoose.models['LifecycleItem'] as Model<ILifecycleItem> | undefined) ??
  mongoose.model<ILifecycleItem>('LifecycleItem', lifecycleItemSchema);
