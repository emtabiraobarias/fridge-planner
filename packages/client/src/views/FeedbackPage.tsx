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
    <div className="mx-auto max-w-2xl">
      <header className="mb-4">
        <h1 className="text-2xl font-bold text-gray-900">Feedback</h1>
        <p className="mt-1 text-sm text-gray-600">
          Report a bug or suggest an improvement. The assistant asks a few questions, then saves a
          structured report you can export as a specification draft.
        </p>
      </header>

      <ChatMessageList messages={messages} pending={sending} />

      {error && (
        <p className="mt-2 text-sm text-red-600" role="alert">
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
