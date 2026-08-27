'use client';
import Link from 'next/link';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useEffect, useRef } from 'react';
import { useFeedback } from '../context/FeedbackContext';
import { ChatMessageList } from '../components/feedback/ChatMessageList';
import { ChatInput } from '../components/feedback/ChatInput';
import { CompletionCard } from '../components/feedback/CompletionCard';
import { FeedbackHistory } from '../components/feedback/FeedbackHistory';
import { ReportStatusList } from '../components/feedback/ReportStatusList';

export function FeedbackPage(): React.JSX.Element {
  const isAdmin = useIsAdmin();
  const { chatState, messages, completedRecord, error, send, reset, resume } = useFeedback();
  const sending = chatState === 'sending';
  const complete = chatState === 'complete';

  // `?resume=<id>` deep link — how quick capture hands an unfinished note over (FR-F-019),
  // and a shareable way back into any record. Read from the URL rather than shared state
  // because FeedbackProvider is mounted per-route, so the overlay and this page never share
  // an instance; the link also survives a reload. `useRef` guards against re-running on
  // re-render, and `window.location` avoids the Suspense boundary `useSearchParams` would
  // require here for what is a one-shot client-only read.
  const adopted = useRef(false);
  useEffect(() => {
    if (adopted.current) return;
    const id = new URLSearchParams(window.location.search).get('resume');
    if (!id) return;
    adopted.current = true;
    void resume(id);
  }, [resume]);

  return (
    <div className="mx-auto max-w-[640px]">
      <header className="mb-4">
        <h1 className="font-heading text-h2 text-ink">Feedback</h1>
        <p className="text-muted mt-1 text-sm">
          Spotted a bug, or wishing for something? Tell us — the assistant asks a couple of
          questions and files a tidy report.
        </p>
        {/* Spec 011 US2: the maintainer's way in to cross-user triage. Deliberately NOT
            a fifth item in the primary nav — that pill/rail/sidebar is a four-item
            layout tuned across five viewport classes, and this app has already shipped
            real clipping defects from exactly that pressure. Feedback is where a
            maintainer is already standing, so the entry costs nothing here.
            Hiding it is a courtesy only; `/admin` is guarded server-side (FR-AD-002). */}
        {isAdmin === true && (
          <Link
            href="/admin"
            className="mt-3 inline-block rounded-full bg-accent-100 px-4 py-2 text-[13px] font-semibold text-accent-800 hover:bg-accent-200"
          >
            Open administration →
          </Link>
        )}
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
      {/* Spec 012 US2: read-only status for the reporter. The acting controls live on the
          maintainer surface (research R6), so this component has none to hide. */}
      <ReportStatusList />
    </div>
  );
}
