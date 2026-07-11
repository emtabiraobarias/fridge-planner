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
      className="flex flex-col gap-3 overflow-y-auto rounded-lg border border-gray-200 bg-white p-4 min-h-[16rem] max-h-[28rem]"
    >
      {messages.length === 0 && !pending && (
        <p className="m-auto max-w-sm text-center text-sm text-gray-500">
          Describe a bug or an idea to improve the app. The assistant will ask a few questions, then
          save a structured report you can review and export.
        </p>
      )}
      {messages.map((m, i) => (
        <div
          key={`${m.at}-${i}`}
          className={m.role === 'user' ? 'self-end text-right' : 'self-start text-left'}
        >
          <span className="mb-0.5 block text-xs font-medium text-gray-400">
            {m.role === 'user' ? 'You' : 'Assistant'}
          </span>
          <span
            className={`inline-block whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${
              m.role === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-800'
            }`}
          >
            {m.content}
          </span>
        </div>
      ))}
      {pending && (
        <div className="self-start text-left" aria-label="Assistant is typing">
          <span className="mb-0.5 block text-xs font-medium text-gray-400">Assistant</span>
          <span className="inline-block rounded-2xl bg-gray-100 px-4 py-2 text-sm text-gray-500">…</span>
        </div>
      )}
    </div>
  );
}
