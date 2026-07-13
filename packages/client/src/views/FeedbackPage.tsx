'use client';
import { useFeedback } from '../context/FeedbackContext';
import { ChatMessageList } from '../components/feedback/ChatMessageList';
import { ChatInput } from '../components/feedback/ChatInput';
import { CompletionCard } from '../components/feedback/CompletionCard';
import { FeedbackHistory } from '../components/feedback/FeedbackHistory';

export function FeedbackPage(): React.JSX.Element {
  const { chatState, messages, completedRecord, error, send, reset } = useFeedback();
  const sending = chatState === 'sending';
  const complete = chatState === 'complete';

  return (
    <div className="mx-auto max-w-[640px]">
      <header className="mb-4">
        <h1 className="font-heading text-h2 text-ink">Feedback</h1>
        <p className="text-muted mt-1 text-sm">
          Spotted a bug, or wishing for something? Tell us — the assistant asks a couple of questions
          and files a tidy report.
        </p>
      </header>

      <ChatMessageList messages={messages} pending={sending} />

      {error && (
        <p className="mt-2 text-sm text-accent-700" role="alert">
          {error} — your message was kept; press Send to try again.
        </p>
      )}

      {complete && completedRecord ? (
        <div className="mt-4">
          <CompletionCard record={completedRecord} onStartAnother={reset} />
        </div>
      ) : (
        <ChatInput onSend={(m) => void send(m)} disabled={sending} />
      )}

      <FeedbackHistory />
    </div>
  );
}
