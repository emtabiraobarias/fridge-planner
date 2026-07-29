'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Overlay } from '../shared/Overlay';
import { useToastOptional } from '../../context/ToastContext';
import { startFeedback, FeedbackAgentUnavailableError } from '../../services/feedback';
import type { FeedbackTurn } from '../../services/feedback';

interface QuickCaptureOverlayProps {
  open: boolean;
  onClose: () => void;
}

type Category = 'bug' | 'idea' | 'love';

const CATEGORIES: { id: Category; label: string; prefix: string }[] = [
  { id: 'bug', label: '🐞 Bug', prefix: 'Bug' },
  { id: 'idea', label: '💡 Idea', prefix: 'Idea' },
  { id: 'love', label: '❤️ Love it', prefix: 'Love it' },
];

const TAG_CLASS: Record<Category, string> = {
  bug: 'bg-accent-100 text-accent-800 border-accent-300',
  idea: 'bg-accent2-100 text-accent2-800 border-accent2-300',
  love: 'bg-neutral-100 text-ink border-neutral-300',
};

/**
 * Additive quick-capture overlay (design §5.4, research D11, FR-RS-006/023):
 * a fast note from any screen that starts a spec `003` feedback record. The
 * full `/feedback` surface — chat, history, Promote to development, pipeline
 * status — is untouched and reachable via the link below (reconciliation item
 * 16). Not a replacement for the shipped Feedback page.
 */
export function QuickCaptureOverlay({
  open,
  onClose,
}: QuickCaptureOverlayProps): React.JSX.Element {
  const [category, setCategory] = useState<Category | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToastOptional();
  const router = useRouter();

  function reset(): void {
    setCategory(null);
    setText('');
  }

  /** Tag the note with the chosen category, so the assistant starts with a type hint. */
  function composeMessage(trimmed: string): string {
    const prefix = CATEGORIES.find((c) => c.id === category)?.prefix;
    return prefix ? `[${prefix}] ${trimmed}` : trimmed;
  }

  /**
   * Report what actually happened to the note (FR-F-019). A record the assistant did not
   * complete is still a *draft* — unexportable (FR-F-007), unpromotable (FR-F-013) — so it
   * must never be announced as filed; hand off to the conversation instead, deep-linked so
   * the transcript and the assistant's question are waiting. The provider is mounted
   * per-route, so a link is the handoff rather than shared state, and it survives a reload.
   */
  function announceOutcome(turn: FeedbackTurn): void {
    if (turn.status === 'complete') {
      toast?.showToast('Thanks — filed it');
      return;
    }
    router.push(`/feedback?resume=${encodeURIComponent(turn.feedback._id)}`);
  }

  async function handleSend(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const turn = await startFeedback(composeMessage(trimmed));
      reset();
      onClose();
      announceOutcome(turn);
    } catch (err) {
      if (err instanceof FeedbackAgentUnavailableError) {
        // The draft IS saved (FR-F-002) — it just needs finishing. Never call it filed.
        reset();
        onClose();
        toast?.showToast('Saved as a draft — open Feedback to finish it');
        return;
      }
      // Anything else: keep the overlay open so the note is not lost and can be retried.
      toast?.showToast('Could not send — please try again');
    } finally {
      setSending(false);
    }
  }

  return (
    <Overlay open={open} onClose={onClose} titleId="quick-capture-title">
      <div>
        <h2 id="quick-capture-title" className="font-heading text-h4 text-ink">
          Tell us anything
        </h2>
        <p className="text-muted mt-1 text-[13px]">
          A quick note — the assistant tidies it into a report. You&rsquo;ll feel heard.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              onClick={() => setCategory((current) => (current === c.id ? null : c.id))}
              className={`whitespace-nowrap rounded-full border px-[14px] py-2 text-[13px] font-semibold transition-colors ${
                category === c.id ? TAG_CLASS[c.id] : 'border-divider text-ink hover:bg-ink/[0.07]'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <label className="mt-3 block">
          <span className="sr-only">What&rsquo;s on your mind?</span>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What's on your mind?"
            rows={4}
            className="min-h-[96px] w-full rounded-[18px] border border-divider bg-surface p-[14px] text-sm text-ink placeholder:text-muted"
          />
        </label>

        <button
          type="button"
          onClick={() => void handleSend()}
          disabled={sending || text.trim().length === 0}
          className="mt-3 min-h-[50px] w-full rounded-full bg-accent text-sm font-semibold text-bg hover:bg-accent-600 disabled:opacity-60"
        >
          {sending ? 'Sending…' : 'Send it'}
        </button>

        <Link
          href="/feedback"
          className="mt-3 block text-center text-[13px] font-semibold text-accent2-700 hover:underline"
        >
          Open full feedback
        </Link>
      </div>
    </Overlay>
  );
}
