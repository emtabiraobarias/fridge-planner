import 'server-only';
import mongoose, { type Document, type Model, Schema } from 'mongoose';
import {
  ADMIN_AUDIT_ACTIONS,
  ADMIN_SUBJECT_TYPES,
  AUDIT_RETENTION_DAYS,
  type IAdminAuditLog,
} from '../types/admin';

export type AdminAuditLogDocument = IAdminAuditLog & Document;

const adminAuditLogSchema = new Schema<IAdminAuditLog>(
  {
    adminUserId: { type: String, required: true, index: true },
    action: { type: String, required: true, enum: ADMIN_AUDIT_ACTIONS },
    subjectUserId: { type: String, index: true, sparse: true },
    subjectType: { type: String, enum: ADMIN_SUBJECT_TYPES },
    subjectId: { type: String },
    at: { type: Date, required: true, default: Date.now },
  },
  // No `timestamps` — `at` is the single time this record has, and an `updatedAt`
  // would imply these are mutable. They are not (FR-AD-022).
  { timestamps: false },
);

// FR-AD-023: retention is enforced by a TTL index rather than a scheduled job —
// this codebase has no background-job infrastructure (spec 008 deliberately chose
// recompute-on-view over one), and Mongo expiring its own documents needs none.
adminAuditLogSchema.index({ at: 1 }, { expireAfterSeconds: AUDIT_RETENTION_DAYS * 24 * 60 * 60 });

// Serves the per-subject review filter (US5 scenario 3).
adminAuditLogSchema.index({ subjectUserId: 1, at: -1 });

export const AdminAuditLog: Model<IAdminAuditLog> =
  (mongoose.models['AdminAuditLog'] as Model<IAdminAuditLog>) ??
  mongoose.model<IAdminAuditLog>('AdminAuditLog', adminAuditLogSchema);
