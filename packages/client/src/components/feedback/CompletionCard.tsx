'use client';
import { useState } from 'react';
import type { FeedbackRecord } from '../../services/feedback';
import { fetchFeedbackExport } from '../../services/feedback';
import { PromoteButton } from './PromoteButton';

interface CompletionCardProps {
  record: FeedbackRecord;
  onStartAnother: () => void;
}

/** Shown when a conversation completes: a summary of the saved record + export/copy actions. */
export function CompletionCard({ record, onStartAnother }: CompletionCardProps): React.JSX.Element {
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function withExport(consume: (md: string) => void): Promise<void> {
    setBusy(true);
    setError('');
    try {
      consume(await fetchFeedbackExport(record._id));
    } catch {
      setError('Could not export this record. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  async function copy(): Promise<void> {
    await withExport(async (md) => {
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  async function download(): Promise<void> {
    await withExport((md) => {
      const blob = new Blob([md], { type: 'text/markdown' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `feedback-${record._id}.md`;
      a.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <section className="rounded-lg bg-accent2-100 p-4" aria-label="Feedback saved">
      <h2 className="font-heading text-h5 text-accent2-900">Thanks — your feedback is saved</h2>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-ink/75">
        <dt className="font-semibold">Title</dt>
        <dd>{record.title}</dd>
        <dt className="font-semibold">Type</dt>
        <dd className="capitalize">{record.type}</dd>
        <dt className="font-semibold">Priority</dt>
        <dd>{record.priority}</dd>
        <dt className="font-semibold">Area</dt>
        <dd>{record.affectedArea}</dd>
      </dl>
      {error && <p className="mt-2 text-sm text-accent-700" role="alert">{error}</p>}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={() => void copy()}
          disabled={busy}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-600 disabled:opacity-45"
        >
          {copied ? 'Copied!' : 'Copy as spec markdown'}
        </button>
        <button
          onClick={() => void download()}
          disabled={busy}
          className="rounded-full border border-divider px-4 py-2 text-sm font-semibold text-ink hover:bg-ink/[0.07] disabled:opacity-45"
        >
          Download .md
        </button>
        <button
          onClick={onStartAnother}
          className="rounded-full px-4 py-2 text-sm font-semibold text-ink/70 hover:bg-ink/[0.07]"
        >
          Start another
        </button>
        <PromoteButton record={record} />
      </div>
    </section>
  );
}
