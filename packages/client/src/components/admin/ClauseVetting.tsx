'use client';
import { useCallback, useEffect, useState } from 'react';
import { draftClauses, fetchClauses, vetClause, type Clause } from '../../services/lifecycle';

/**
 * Clause vetting at `briefed` (spec 012 US3, D20).
 *
 * **Vetting is a COMPARISON, not a proofread.** Each clause is rendered directly beside the
 * record text it was derived from (FR-FL-025), because well-formed EARS is easy to accept
 * uncritically — a model can produce beautifully-shaped clauses that are subtly wrong. Anything
 * the agent inferred is flagged, so the reader knows which words were never the reporter's.
 */

interface Props {
  itemId: string;
}

export function ClauseVetting({ itemId }: Props): React.JSX.Element {
  const [clauses, setClauses] = useState<Clause[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setClauses(await fetchClauses(itemId));
      setError('');
    } catch {
      setError('Could not load the clauses.');
    } finally {
      setLoading(false);
    }
  }, [itemId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function draft(): Promise<void> {
    setBusy(true);
    setError('');
    try {
      const next = await draftClauses(itemId);
      setClauses(next);
      // Drafting is an ASSIST, never a precondition (FR-FL-031) — say so plainly rather than
      // leaving an empty list that looks like a failure.
      if (next.length === 0) setError('No clauses could be drafted. Write them by hand below.');
    } catch {
      setError('Drafting failed. You can still write the clauses by hand.');
    } finally {
      setBusy(false);
    }
  }

  async function vet(id: string, verdict: 'accepted' | 'rejected'): Promise<void> {
    try {
      setClauses(await vetClause(itemId, id, verdict));
    } catch {
      setError('That clause could not be updated.');
    }
  }

  const pending = clauses.filter((c) => c.vetted === 'pending').length;

  return (
    <div className="mt-2 basis-full rounded-lg border border-divider p-3" aria-label="Clause vetting">
      <div className="flex items-center justify-between">
        <h3 className="font-heading text-sm text-ink">Requirements to vet</h3>
        <button
          type="button"
          onClick={() => void draft()}
          disabled={busy}
          className="rounded-full border border-divider px-3 py-1 text-xs font-semibold text-ink hover:bg-ink/[0.07] disabled:opacity-45"
        >
          {busy ? 'Drafting…' : 'Draft from the report'}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 rounded-lg bg-accent-100 p-2 text-xs text-accent-800">
          {error}
        </p>
      )}
      {loading && <p className="text-muted mt-2 text-xs">Loading…</p>}

      {!loading && clauses.length === 0 && (
        <p className="text-muted mt-2 text-xs">
          Nothing drafted yet. Nothing reaches spec until every clause is vetted.
        </p>
      )}

      <ul className="mt-2 flex flex-col gap-2">
        {clauses.map((c) => (
          <li key={c.provisionalId} className="rounded-lg bg-surface p-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink">
                  <span className="text-muted mr-1 font-mono text-xs">{c.provisionalId}</span>
                  {c.editedText ?? c.text}
                  {c.inferred && (
                    <span className="ml-2 rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-semibold text-accent-800">
                      inferred
                    </span>
                  )}
                </p>
                {/* The comparison, side by side — this is the whole point of the step. */}
                <p className="text-muted mt-1 border-l-2 border-divider pl-2 text-xs italic">
                  from: “{c.derivedFrom}”
                </p>
              </div>

              {c.vetted === 'pending' ? (
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void vet(c.provisionalId, 'accepted')}
                    className="rounded-full bg-accent px-3 py-1 text-xs font-semibold text-bg hover:bg-accent-600"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void vet(c.provisionalId, 'rejected')}
                    className="text-xs font-semibold text-accent-700 hover:text-accent-800"
                  >
                    Reject
                  </button>
                </div>
              ) : (
                <span
                  data-testid={`clause-${c.provisionalId}`}
                  className="text-muted shrink-0 text-xs font-semibold"
                >
                  {c.vetted}
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>

      {clauses.length > 0 && (
        <p className="text-muted mt-2 text-xs">
          {pending === 0
            ? 'All vetted — this can go to spec.'
            : `${pending} still to vet before this can go to spec.`}
        </p>
      )}
    </div>
  );
}
