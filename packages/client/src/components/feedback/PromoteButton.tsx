'use client';
import { useState } from 'react';
import { usePipeline } from '../../context/PipelineContext';
import type { FeedbackRecord } from '../../services/feedback';

interface PromoteButtonProps {
  record: FeedbackRecord;
}

/** The one-tap entry point into the development pipeline (FR-F-013). Only a completed
 * record is promotable — absent (not merely disabled) for a draft (D8). */
export function PromoteButton({ record }: PromoteButtonProps): React.JSX.Element | null {
  const { promote } = usePipeline();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (record.status === 'draft') return null;

  async function handleClick(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      await promote(record._id);
    } catch {
      setError('Could not promote this record. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start">
      <button
        type="button"
        onClick={() => void handleClick()}
        disabled={busy}
        className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-600 disabled:opacity-45"
      >
        {busy ? 'Promoting…' : 'Promote to development'}
      </button>
      {error && (
        <p role="alert" className="mt-1 text-xs text-accent-700">
          {error}
        </p>
      )}
    </span>
  );
}
