'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchOwnLifecycle, type ReporterItem } from '../../services/lifecycle';

/**
 * What the reporter gets back (spec 012 US2).
 *
 * READ-ONLY by construction — there are no controls here at all. The transition controls live
 * on the maintainer surface (FR-FL-052/053, research R6), so this is no longer a component that
 * merely hides its buttons: it has none to hide. `GET /lifecycle` is not admin-guarded because
 * seeing where your own report stands is the point.
 */

const REASON_TEXT: Record<string, string> = {
  'no-action-required': 'No action needed — this is working as intended, or already answered.',
  declined: 'A fair request, but not something we’re building.',
};

export function ReportStatusList(): React.JSX.Element {
  const [items, setItems] = useState<ReporterItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError('');
    try {
      setItems(await fetchOwnLifecycle());
    } catch {
      // Never render a failure as emptiness (the FR-F-021 lesson).
      setError('Could not load your reports.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <section className="mt-8" aria-label="Your reports">
      <h2 className="font-heading text-h5 text-ink mb-2">What happened to your reports</h2>

      {error && (
        <p role="alert" className="mb-2 rounded-lg bg-accent-100 p-2 text-sm text-accent-800">
          {error}
        </p>
      )}
      {loading && <p className="text-muted text-sm">Loading…</p>}
      {!loading && !error && items.length === 0 && (
        <p className="text-muted text-sm">Nothing here yet — reports appear once they’re filed.</p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <li key={item._id} className="rounded-lg bg-surface p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
                {item.sourceTitle}
              </p>
              <span
                data-testid={`reporter-stage-${item._id}`}
                className="rounded-full bg-accent2-100 px-2 py-0.5 text-xs font-medium text-accent2-800"
              >
                {item.stageLabel}
              </span>
            </div>

            {/* For declined work the reason IS the answer (FR-FL-065). */}
            {item.dismissalReason && (
              <p className="text-muted mt-1 text-xs">{REASON_TEXT[item.dismissalReason]}</p>
            )}

            {/* A merged report shows the target's STATUS ONLY — never its detail (FR-FL-019). */}
            {item.mergedTargetStage && (
              <p className="text-muted mt-1 text-xs">
                Merged with an existing report, currently: {item.mergedTargetStage}
              </p>
            )}

            {item.reply && (
              <p className="mt-2 border-l-2 border-accent2-300 pl-2 text-sm text-ink">
                {item.reply.text}
              </p>
            )}

            {item.closure && (
              <div className="mt-2 text-sm text-ink">
                <p>{item.closure.excerpt}</p>
                {item.closure.releaseUrl && (
                  <a
                    href={item.closure.releaseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-semibold text-accent hover:text-accent-600"
                  >
                    {item.closure.releaseTag ?? 'Release'}
                  </a>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
