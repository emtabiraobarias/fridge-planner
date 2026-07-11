import mongoose, { type Document, type Model, Schema } from 'mongoose';
import type { IFeedbackMessage, IFeedbackRecord } from '../types/feedback';
import { AFFECTED_AREAS, FEEDBACK_STATUSES, FEEDBACK_TYPES, MESSAGE_ROLES, PRIORITIES } from '../types/feedback';

export type FeedbackRecordDocument = IFeedbackRecord & Document;

const messageSchema = new Schema<IFeedbackMessage>(
  {
    role: { type: String, required: true, enum: MESSAGE_ROLES },
    content: { type: String, required: true },
    at: { type: Date, required: true, default: Date.now },
  },
  { _id: false },
);

const acceptanceCriterionSchema = new Schema(
  {
    given: { type: String, required: true },
    when: { type: String, required: true },
    then: { type: String, required: true },
  },
  { _id: false },
);

const feedbackRecordSchema = new Schema<IFeedbackRecord>(
  {
    userId: { type: String, required: true, index: true },
    status: { type: String, required: true, enum: FEEDBACK_STATUSES, default: 'draft' },
    transcript: { type: [messageSchema], default: [] },

    // Structured spec-shaped fields — absent until the conversation completes (FR-F-003).
    type: { type: String, enum: FEEDBACK_TYPES },
    title: { type: String },
    problemStatement: { type: String },
    userStory: { type: String },
    acceptanceCriteria: { type: [acceptanceCriterionSchema], default: undefined },
    reproSteps: { type: [String], default: undefined },
    expectedBehavior: { type: String },
    actualBehavior: { type: String },
    affectedArea: { type: String, enum: AFFECTED_AREAS },
    priority: { type: String, enum: PRIORITIES },
  },
  { timestamps: true },
);

// Own-records list view is filtered by user + status and sorted by recency.
feedbackRecordSchema.index({ userId: 1, status: 1 });

// Reuse the compiled model across Next.js dev hot-reloads (avoids OverwriteModelError).
export const FeedbackRecord: Model<IFeedbackRecord> =
  (mongoose.models['FeedbackRecord'] as Model<IFeedbackRecord> | undefined) ??
  mongoose.model<IFeedbackRecord>('FeedbackRecord', feedbackRecordSchema);
