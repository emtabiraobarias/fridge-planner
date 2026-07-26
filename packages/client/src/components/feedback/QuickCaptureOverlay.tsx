'use client';
import { useState } from 'react';
import Link from 'next/link';
import { Overlay } from '../shared/Overlay';
import { useToastOptional } from '../../context/ToastContext';
import { startFeedback } from '../../services/feedback';

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
export function QuickCaptureOverlay({ open, onClose }: QuickCaptureOverlayProps): React.JSX.Element {
  const [category, setCategory] = useState<Category | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const toast = useToastOptional();

  function reset(): void {
    setCategory(null);
    setText('');
  }

  async function handleSend(): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    const tag = category ? CATEGORIES.find((c) => c.id === category)?.prefix : undefined;
    const message = tag ? `[${tag}] ${trimmed}` : trimmed;
    setSending(true);
    try {
      await startFeedback(message);
      reset();
      onClose();
      toast?.showToast('Thanks — we hear you');
    } catch {
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

        <Link href="/feedback" className="mt-3 block text-center text-[13px] font-semibold text-accent2-700 hover:underline">
          Open full feedback
        </Link>
      </div>
    </Overlay>
  );
}
