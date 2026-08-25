import 'server-only';
import type { LifecycleStage } from '../lib/lifecycle-stages';

/**
 * Spec 012 domain types. Supersedes `types/pipeline.ts`, which stays in place while
 * `/api/v1/pipeline/**` is deprecated rather than deleted (plan → Migration): removing it in the
 * same change that rewrites the model would make the diff impossible to bisect.
 */

export const DISMISSAL_REASONS = ['no-action-required', 'declined'] as const;
export type DismissalReason = (typeof DISMISSAL_REASONS)[number];

export const CLAUSE_VETTING_STATES = ['pending', 'accepted', 'rejected'] as const;
export type ClauseVettingState = (typeof CLAUSE_VETTING_STATES)[number];

export const ARTIFACT_TYPES = ['draft-spec', 'pull-request'] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const TRANSITION_ACTORS = ['human', 'session'] as const;
export type TransitionActor = (typeof TRANSITION_ACTORS)[number];

export interface ITransitionLogEntry {
  from: LifecycleStage | null;
  to: LifecycleStage;
  actor: TransitionActor;
  /** WHICH administrator — an approval must evidence who approved (FR-FL-012). */
  actorUserId?: string;
  at: Date;
  /** Server-derived, never taken from the request (FR-FL-013). */
  isGateApproval: boolean;
  note?: string;
}

export interface IClause {
  /** Provisional until `/speckit.specify` promotes it — never a real `FR-` number (FR-FL-027). */
  provisionalId: string;
  text: string;
  /**
   * The record text this clause came from, shown BESIDE it. Required, not optional: vetting is a
   * comparison (FR-FL-025), and a clause with nothing to compare against degrades into a
   * proofread.
   */
  derivedFrom: string;
  /** Anything not stated in the record is marked, as forced-finalize marks its guesses. */
  inferred: boolean;
  vetted: ClauseVettingState;
  editedText?: string;
  vettedBy?: string;
  vettedAt?: Date;
}

export interface IClosureRecord {
  /** Maintainer-confirmed, seeded from the reporter's own words (FR-FL-041/042). */
  excerpt: string;
  releaseTag?: string;
  releaseUrl?: string;
  /** Used when the release list was unavailable — a first-class path, not an error (FR-FL-044). */
  releaseFallbackText?: string;
  unavailableReason?: string;
  closedBy: string;
  closedAt: Date;
}

export interface IMaintainerReply {
  text: string;
  byUserId: string;
  at: Date;
}

export interface IArtifactLink {
  type: ArtifactType;
  /** A reference only — never dereferenced, never executed (FR-FL-057). */
  ref: string;
  at: Date;
  note?: string;
}

export interface ILifecycleItem {
  /** The REPORTER. Cleared to a sentinel on erasure rather than deleted (FR-FL-059/060). */
  userId: string;
  feedbackRecordId: string;

  sourceTitle: string;
  sourceType: 'bug' | 'improvement';
  sourceAffectedArea: string;

  stage: LifecycleStage;
  parkedFromStage?: LifecycleStage;
  /** Queue position. A ranked queue, not a flat list — and not a P1/P2/P3 label (FR-FL-022). */
  rank?: number;

  dismissalReason?: DismissalReason;
  /** Target item. NEVER projected to a reporter — they see its stage only (FR-FL-019). */
  mergedInto?: string;
  /** Reference only; citing moves nothing (FR-FL-050/051). */
  cites?: string[];

  acceptedBy?: string;
  acceptedAt?: Date;

  transitions: ITransitionLogEntry[];
  clauses: IClause[];
  reply?: IMaintainerReply;
  closure?: IClosureRecord;
  artifacts: IArtifactLink[];

  reporterErasedAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

/** Sentinel `userId` for an item whose reporter was erased (D15). */
export const ERASED_REPORTER = '__erased__';
