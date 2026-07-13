'use client';
import type { FeedbackMessage } from '../../services/feedback';

interface ChatMessageListProps {
  messages: FeedbackMessage[];
  pending: boolean;
}

/** Scrollable conversation transcript. `role="log"` + `aria-live` announce new messages (WCAG 2.1 AA). */
export function ChatMessageList({ messages, pending }: ChatMessageListProps): React.JSX.Element {
  return (
    <div
      role="log"
      aria-live="polite"
      aria-label="Feedback conversation"
      className="flex max-h-[420px] min-h-[280px] flex-col gap-3 overflow-y-auto rounded-lg bg-surface p-4"
    >
      {messages.length === 0 && !pending && (
        <p className="text-muted m-auto max-w-sm text-center text-sm">
          Describe a bug or an idea. A short back-and-forth, then it&apos;s saved for review.
        </p>
      )}
      {messages.map((m, i) => (
        <div
          key={`${m.at}-${i}`}
          className={m.role === 'user' ? 'self-end text-right' : 'self-start text-left'}
        >
          <span className="text-muted mb-0.5 block text-[11px]">
            {m.role === 'user' ? 'You' : 'Assistant'}
          </span>
          <span
            className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-[20px] px-4 py-[9px] text-left text-sm ${
              m.role === 'user' ? 'bg-accent text-bg' : 'bg-bg text-ink'
            }`}
          >
            {m.content}
          </span>
        </div>
      ))}
      {pending && (
        <div className="self-start text-left" aria-label="Assistant is typing">
          <span className="text-muted mb-0.5 block text-[11px]">Assistant</span>
          <span className="inline-block rounded-[20px] bg-bg px-4 py-[9px] text-sm text-ink/60">…</span>
        </div>
      )}
    </div>
  );
}
