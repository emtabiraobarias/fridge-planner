'use client';
import { useState } from 'react';
import { Overlay } from '../shared/Overlay';
import { ClauseVetting } from './ClauseVetting';
import { ClosureComposer } from './ClosureComposer';
import { STAGE_LABEL } from './StageFilter';
import type {
  DismissalReason,
  LifecycleAction,
  LifecycleStage,
  LifecycleSummary,
} from '../../services/lifecycle';

/** Which artifact each stage expects, per the design's contract table. */
const ARTIFACT_FOR: Partial<Record<LifecycleStage, { type: 'draft-spec' | 'pull-request'; label: string; placeholder: string }>> = {
  'in-spec': { type: 'draft-spec', label: 'Attach draft spec', placeholder: 'specs/013-…/spec.md' },
  'in-progress': {
    type: 'pull-request',
    label: 'Attach pull request',
    placeholder: 'https://github.com/…/pull/42',
  },
};

function hasPullRequest(item: LifecycleSummary): boolean {
  return (item.artifacts ?? []).some((a) => a.type === 'pull-request');
}

/**
 * One item, opened (spec 012 US1/US4).
 *
 * Every control an item can offer lives here rather than on its row. Clause vetting and the
 * closure composer used to expand *inside* a row, which on a phone pushed a wall of controls
 * into a list cell — and on a 320px screen the clause comparison, which is the entire point of
 * the step (FR-FL-025), was unreadable. `Overlay` gives a bottom sheet on touch and a centred
 * dialog on desktop, with the focus trap and Escape handling already solved.
 *
 * The stage table below mirrors `lib/lifecycle-stages.ts`. The SERVER remains the authority:
 * an illegal action is refused with 409 regardless of what renders (FR-FL-054), so this table
 * being wrong makes a control useless, never dangerous.
 */

interface Control {
  label: string;
  action: LifecycleAction;
  /** Gate approvals are visually distinct — they are the three moments a human must decide. */
  gate?: boolean;
}

const CONTROLS: Partial<Record<LifecycleStage, Control[]>> = {
  new: [{ label: 'Accept', action: { action: 'accept' }, gate: true }],
  accepted: [{ label: 'Brief it', action: { action: 'advance' } }],
  briefed: [{ label: 'Send to spec', action: { action: 'advance' } }],
  'in-spec': [
    { label: 'Approve spec', action: { action: 'approve-spec' }, gate: true },
    { label: 'Reject spec', action: { action: 'reject-spec' } },
  ],
  // `in-progress` is handled in StageActions: its advance is conditional on a pull request
  // existing (FR-FL-067), which CONTROLS cannot express — it depends on the item's content.
  'in-review': [
    { label: 'Approve release', action: { action: 'approve-release' }, gate: true },
    // FR-FL-064 — without this, review finding a problem has nowhere to send the work.
    { label: 'Changes needed', action: { action: 'reject-release' } },
  ],
  parked: [{ label: 'Reopen', action: { action: 'reopen' } }],
  // `shipped` deliberately has none: nothing auto-closes on merge or release (D9), and closing
  // needs an excerpt, so it opens the composer instead of firing an action.
};

const REASONS: { value: DismissalReason; label: string }[] = [
  { value: 'no-action-required', label: 'No action required' },
  { value: 'declined', label: 'Declined' },
];

/** Terminal stages are the end of the road (FR-FL-002) — nothing to do but read. */
const TERMINAL: LifecycleStage[] = ['closed', 'dismissed', 'merged'];

const GATE_BUTTON =
  'min-h-[44px] rounded-full bg-accent px-5 text-sm font-semibold text-bg hover:bg-accent-600';
const PLAIN_BUTTON =
  'min-h-[44px] rounded-full border border-divider px-4 text-sm font-semibold text-ink hover:bg-ink/[0.07]';
const QUIET_BUTTON = 'min-h-[44px] px-2 text-sm font-semibold text-muted hover:text-ink';
// 16px on touch or iOS zooms toward the focused control and never zooms back out (SC-RS-003).
const FIELD_CLASS =
  'mt-1 min-h-[44px] w-full rounded-lg border border-divider p-2 text-base text-ink xl:text-sm';

/** Mirrors AFFECTED_AREAS in `src/server/types/feedback.ts`; the server rejects anything else. */
const AREAS = [
  'inventory',
  'meal-plan',
  'grocery',
  'recommendations',
  'auth',
  'feedback',
  'other',
];

/** Editable only at `new` and `accepted` (FR-FL-020) — once clauses are derived from the text,
 *  editing it would silently invalidate what was vetted. */
const EDITABLE_STAGES: LifecycleStage[] = ['new', 'accepted'];

interface EditFormProps {
  item: LifecycleSummary;
  onSave: (action: LifecycleAction) => void;
  onCancel: () => void;
}

function EditSourceForm({ item, onSave, onCancel }: EditFormProps): React.JSX.Element {
  const [title, setTitle] = useState(item.sourceTitle);
  const [area, setArea] = useState(item.sourceAffectedArea);
  const [rank, setRank] = useState(item.rank === undefined ? '' : String(item.rank));

  return (
    <div className="mt-4 rounded-lg border border-divider p-3" aria-label="Edit report details">
      <label className="text-muted block text-xs font-semibold" htmlFor={`edit-title-${item._id}`}>
        Title
      </label>
      <input
        id={`edit-title-${item._id}`}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={FIELD_CLASS}
      />

      <label
        className="text-muted mt-3 block text-xs font-semibold"
        htmlFor={`edit-area-${item._id}`}
      >
        Affected area
      </label>
      <select
        id={`edit-area-${item._id}`}
        value={area}
        onChange={(e) => setArea(e.target.value)}
        className={FIELD_CLASS}
      >
        {AREAS.map((a) => (
          <option key={a} value={a}>
            {a}
          </option>
        ))}
      </select>

      {/* FR-FL-022 — the queue is presented in this order, unranked last. The comment sits
          OUTSIDE the label: inside, it left a trailing space in the accessible name. */}
      <label className="text-muted mt-3 block text-xs font-semibold" htmlFor={`edit-rank-${item._id}`}>
        Rank
      </label>
      {/* Its own control, not folded into Save: rank is a separate server action, and firing
          two PATCHes from one click leaves their order — and the refresh between them — to chance. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input
          id={`edit-rank-${item._id}`}
          type="number"
          min={0}
          value={rank}
          onChange={(e) => setRank(e.target.value)}
          className={FIELD_CLASS}
        />
        <button
          type="button"
          disabled={rank === '' || !Number.isInteger(Number(rank)) || Number(rank) < 0}
          onClick={() => onSave({ action: 'set-rank', rank: Number(rank) })}
          className={`${PLAIN_BUTTON} shrink-0 disabled:opacity-45`}
        >
          Set rank
        </button>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="button"
          disabled={title.trim().length === 0}
          onClick={() =>
            onSave({ action: 'edit-source', sourceTitle: title.trim(), sourceAffectedArea: area })
          }
          className={`${GATE_BUTTON} disabled:opacity-45`}
        >
          Save details
        </button>
        <button type="button" onClick={onCancel} className={QUIET_BUTTON}>
          Cancel
        </button>
      </div>
    </div>
  );
}

type Step = 'none' | 'dismiss' | 'merge' | 'close' | 'edit';

interface HeaderProps {
  item: LifecycleSummary;
  titleId: string;
  onOpenReporter?: (userId: string) => void;
}

function ItemHeader({ item, titleId, onOpenReporter }: HeaderProps): React.JSX.Element {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <span
          data-testid={`modal-stage-${item._id}`}
          className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-800"
        >
          {STAGE_LABEL[item.stage] ?? item.stage}
        </span>
        {item.dismissalReason && (
          <span className="text-muted text-xs">
            {REASONS.find((r) => r.value === item.dismissalReason)?.label ?? item.dismissalReason}
          </span>
        )}
        {item.rank !== undefined && <span className="text-muted text-xs">rank {item.rank}</span>}
      </div>

      {/* Report text is rendered as text (FR-AD-014) — React escapes by construction and this
          tree has no dangerouslySetInnerHTML. */}
      <h2 id={titleId} className="font-heading mt-2 text-h5 text-ink">
        {item.sourceTitle}
      </h2>

      <p className="text-muted mt-1 text-sm">
        {onOpenReporter ? (
          <button
            type="button"
            onClick={() => onOpenReporter(item.userId)}
            className="font-semibold text-accent underline hover:text-accent-600"
          >
            {item.userId}
          </button>
        ) : (
          <span>{item.userId}</span>
        )}
        {` · ${item.sourceType} · ${item.sourceAffectedArea}`}
        {/* A detached item has no reporter to attribute it to (FR-FL-060). */}
        {item.reporterErasedAt ? ' · reporter erased' : ''}
      </p>
    </>
  );
}

/**
 * The one conditional advance in the contract table: `in-progress` moves on only when a pull
 * request exists (FR-FL-067). Disabled rather than live-and-refused, so the reason arrives
 * before the click instead of as a 409 after it.
 */
function ReadyForReview({
  item,
  onFire,
}: {
  item: LifecycleSummary;
  onFire: (action: LifecycleAction) => void;
}): React.JSX.Element {
  const ready = hasPullRequest(item);
  return (
    <button
      type="button"
      onClick={() => onFire({ action: 'advance' })}
      disabled={!ready}
      title={ready ? undefined : 'Attach the pull request first'}
      className={`${PLAIN_BUTTON} disabled:opacity-45`}
    >
      Ready for review
    </button>
  );
}

interface ActionsProps {
  item: LifecycleSummary;
  onFire: (action: LifecycleAction) => void;
  onStep: (step: Step) => void;
}

function StageActions({ item, onFire, onStep }: ActionsProps): React.JSX.Element {
  const terminal = TERMINAL.includes(item.stage);
  return (
    <>
      {item.stage === 'in-progress' && <ReadyForReview item={item} onFire={onFire} />}
      {(CONTROLS[item.stage] ?? []).map((c) => (
        <button
          key={c.label}
          type="button"
          onClick={() => onFire(c.action)}
          className={c.gate ? GATE_BUTTON : PLAIN_BUTTON}
        >
          {c.label}
        </button>
      ))}
      {item.stage === 'new' && (
        <>
          <button type="button" onClick={() => onStep('dismiss')} className={PLAIN_BUTTON}>
            Dismiss
          </button>
          <button type="button" onClick={() => onStep('merge')} className={QUIET_BUTTON}>
            Merge
          </button>
        </>
      )}
      {item.stage === 'shipped' && (
        <button type="button" onClick={() => onStep('close')} className={GATE_BUTTON}>
          Close
        </button>
      )}
      {EDITABLE_STAGES.includes(item.stage) && (
        <button type="button" onClick={() => onStep('edit')} className={PLAIN_BUTTON}>
          Edit details
        </button>
      )}
      {!terminal && item.stage !== 'parked' && item.stage !== 'shipped' && (
        <button type="button" onClick={() => onFire({ action: 'park' })} className={QUIET_BUTTON}>
          Park
        </button>
      )}
      {terminal && <p className="text-muted text-sm">This item is closed to further action.</p>}
    </>
  );
}

interface ChoiceProps {
  step: Step;
  mergeTargets: LifecycleSummary[];
  onFire: (action: LifecycleAction) => void;
  onCancel: () => void;
}

/** The second half of a two-step decision: the reason, or the target (FR-FL-016/018). */
function ChoiceStep({ step, mergeTargets, onFire, onCancel }: ChoiceProps): React.JSX.Element {
  const isDismiss = step === 'dismiss';
  return (
    <>
      <span className="text-muted text-sm">{isDismiss ? 'Reason:' : 'Duplicate of:'}</span>
      {isDismiss &&
        REASONS.map((r) => (
          <button
            key={r.value}
            type="button"
            onClick={() => onFire({ action: 'dismiss', reason: r.value })}
            className={PLAIN_BUTTON}
          >
            {r.label}
          </button>
        ))}
      {!isDismiss && mergeTargets.length === 0 && (
        <span className="text-muted text-sm">Nothing else to merge into.</span>
      )}
      {!isDismiss &&
        mergeTargets.slice(0, 6).map((t) => (
          <button
            key={t._id}
            type="button"
            onClick={() => onFire({ action: 'merge', targetId: t._id })}
            className={`${PLAIN_BUTTON} max-w-full truncate text-left`}
          >
            {t.sourceTitle}
          </button>
        ))}
      <button type="button" onClick={onCancel} className={QUIET_BUTTON}>
        Cancel
      </button>
    </>
  );
}

function ArtifactSection({
  item,
  onAttach,
}: {
  item: LifecycleSummary;
  onAttach: (action: LifecycleAction) => void;
}): React.JSX.Element {
  const [ref, setRef] = useState('');
  const spec = ARTIFACT_FOR[item.stage];
  const attached = item.artifacts ?? [];

  return (
    <div className="mt-4 rounded-lg border border-divider p-3" aria-label="Attached references">
      <h3 className="font-heading text-sm text-ink">References</h3>

      {attached.length === 0 && <p className="text-muted mt-1 text-xs">Nothing attached yet.</p>}
      <ul className="mt-1 flex flex-col gap-1">
        {attached.map((a) => (
          <li key={`${a.type}-${a.ref}`} className="text-xs text-ink">
            <span className="text-muted mr-2 font-mono">{a.type}</span>
            {/* Rendered as TEXT, never as a link: the app must not invite a click it has not
                verified, and it never dereferences the reference itself. */}
            <span className="break-all">{a.ref}</span>
          </li>
        ))}
      </ul>

      {spec && (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor={`attach-${item._id}`}>
            {spec.label}
          </label>
          <input
            id={`attach-${item._id}`}
            value={ref}
            placeholder={spec.placeholder}
            onChange={(e) => setRef(e.target.value)}
            className={FIELD_CLASS}
          />
          <button
            type="button"
            disabled={ref.trim().length === 0}
            onClick={() => {
              onAttach({ action: 'attach-artifact', artifact: { type: spec.type, ref: ref.trim() } });
              setRef('');
            }}
            className={`${PLAIN_BUTTON} shrink-0 disabled:opacity-45`}
          >
            {spec.label}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * The panels that hang off a stage rather than off a button: the edit form, the clauses that
 * ARE the work at `briefed`, the references, and the closure composer.
 *
 * Extracted so `LifecycleItemModal` stays a shell — each of these is a branch, and together
 * they took it past the complexity limit.
 */
function StageExtras({
  item,
  step,
  onFire,
  onAction,
  onStep,
}: {
  item: LifecycleSummary;
  step: Step;
  onFire: (action: LifecycleAction) => void;
  onAction: (action: LifecycleAction) => void;
  onStep: (step: Step) => void;
}): React.JSX.Element {
  const showArtifacts = Boolean(ARTIFACT_FOR[item.stage]) || (item.artifacts ?? []).length > 0;
  return (
    <>
      {step === 'edit' && (
        <EditSourceForm item={item} onSave={onFire} onCancel={() => onStep('none')} />
      )}

      {/* At `briefed` the clauses ARE the work — advancing is blocked until they are vetted
          (FR-FL-028), so they open with the item rather than behind a further click. */}
      {item.stage === 'briefed' && <ClauseVetting itemId={item._id} />}

      {/* References the maintainer opens — the app never follows them (FR-FL-057). Until now
          `attach-artifact` had no control at all, so the spec and PR links the contract table
          calls for could only be attached by curl. */}
      {showArtifacts && <ArtifactSection item={item} onAttach={onAction} />}

      {step === 'close' && (
        <ClosureComposer
          sourceTitle={item.sourceTitle}
          onCancel={() => onStep('none')}
          onClose={onFire}
        />
      )}
    </>
  );
}

interface Props {
  item: LifecycleSummary;
  /** Other items, offered as merge targets. */
  mergeTargets: LifecycleSummary[];
  onAction: (action: LifecycleAction) => void;
  onClose: () => void;
  /** Opens the reporter's kitchen read-only (FR-AD-015). Absent where that is not offered. */
  onOpenReporter?: (userId: string) => void;
  error?: string;
}

export function LifecycleItemModal({
  item,
  mergeTargets,
  onAction,
  onClose,
  onOpenReporter,
  error,
}: Props): React.JSX.Element {
  const [step, setStep] = useState<Step>('none');
  const titleId = `lifecycle-item-${item._id}`;

  function fire(action: LifecycleAction): void {
    setStep('none');
    onAction(action);
  }

  return (
    <Overlay open onClose={onClose} titleId={titleId} wide>
      <ItemHeader item={item} titleId={titleId} {...(onOpenReporter ? { onOpenReporter } : {})} />

      {error && (
        <p role="alert" className="mt-3 rounded-lg bg-accent-100 p-3 text-sm text-accent-800">
          {error}
        </p>
      )}

      {/* Stacked full-width on a phone, inline once there is room — a row of pill buttons
          wrapping mid-word is how these read at 320px. */}
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
        {step === 'none' && <StageActions item={item} onFire={fire} onStep={setStep} />}
        {(step === 'dismiss' || step === 'merge') && (
          <ChoiceStep
            step={step}
            mergeTargets={mergeTargets}
            onFire={fire}
            onCancel={() => setStep('none')}
          />
        )}
      </div>

      <StageExtras item={item} step={step} onFire={fire} onAction={onAction} onStep={setStep} />

      <button type="button" onClick={onClose} className={`${PLAIN_BUTTON} mt-5 w-full sm:w-auto`}>
        Done
      </button>
    </Overlay>
  );
}
