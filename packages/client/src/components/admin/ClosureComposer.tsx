'use client';
import { useEffect, useState } from 'react';
import { fetchReleaseList, type LifecycleAction, type ReleaseList } from '../../services/lifecycle';

/**
 * Closing an item (spec 012 US5, D17).
 *
 * Two pieces: a short excerpt written FOR the reporter, and the release it shipped in. The
 * excerpt is pre-filled from the reporter's own title (FR-FL-041) — an excerpt keeps exposure
 * chosen, where pasting a whole release note may name branches, unrelated features, or other
 * people's work.
 *
 * If the release list cannot be read the form falls back to free text **and says why**
 * (FR-FL-044). Closure is never blocked on a third party (FR-FL-045).
 */

interface Props {
  sourceTitle: string;
  onClose: (action: Extract<LifecycleAction, { action: 'close' }>) => void;
  onCancel: () => void;
}

export function ClosureComposer({ sourceTitle, onClose, onCancel }: Props): React.JSX.Element {
  // Seeded from the reporter's own words, then confirmed or rewritten (FR-FL-042).
  const [excerpt, setExcerpt] = useState(`${sourceTitle} — this is now fixed.`);
  const [list, setList] = useState<ReleaseList | null>(null);
  const [tag, setTag] = useState('');
  const [fallback, setFallback] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetchReleaseList()
      .then((l) => {
        if (!cancelled) setList(l);
      })
      .catch(() => {
        // Even a failed request must not block closing — degrade to free text.
        if (!cancelled) {
          setList({ releases: [], available: false, unavailableReason: 'The release list could not be read.' });
        }
      });
    return (): void => {
      cancelled = true;
    };
  }, []);

  const picked = list?.releases.find((r) => r.tag === tag);
  const canClose = excerpt.trim().length > 0;

  function submit(): void {
    onClose({
      action: 'close',
      excerpt: excerpt.trim(),
      ...(picked ? { releaseTag: picked.tag, releaseUrl: picked.url } : {}),
      ...(!picked && fallback.trim() ? { releaseFallbackText: fallback.trim() } : {}),
      ...(list && !list.available && list.unavailableReason
        ? { unavailableReason: list.unavailableReason }
        : {}),
    });
  }

  return (
    <div className="mt-2 basis-full rounded-lg border border-divider p-3" aria-label="Close item">
      <label className="text-muted block text-xs font-semibold" htmlFor="closure-excerpt">
        What the reporter will see
      </label>
      <textarea
        id="closure-excerpt"
        value={excerpt}
        onChange={(e) => setExcerpt(e.target.value)}
        rows={2}
        className="mt-1 w-full rounded-lg border border-divider p-2 text-sm text-ink"
      />

      {list === null && <p className="text-muted mt-2 text-xs">Loading releases…</p>}

      {list?.available && (
        <>
          <label className="text-muted mt-2 block text-xs font-semibold" htmlFor="closure-release">
            Release
          </label>
          <select
            id="closure-release"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="mt-1 w-full rounded-lg border border-divider p-2 text-sm text-ink"
          >
            <option value="">(none)</option>
            {list.releases.map((r) => (
              <option key={r.tag} value={r.tag}>
                {r.name}
              </option>
            ))}
          </select>
        </>
      )}

      {list && !list.available && (
        <>
          {/* Says WHY, rather than silently offering a text box (FR-FL-044). */}
          <p role="status" className="text-muted mt-2 text-xs">
            {list.unavailableReason} You can type the release instead.
          </p>
          <input
            aria-label="Release (free text)"
            value={fallback}
            onChange={(e) => setFallback(e.target.value)}
            className="mt-1 w-full rounded-lg border border-divider p-2 text-sm text-ink"
          />
        </>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          disabled={!canClose}
          onClick={submit}
          className="rounded-full bg-accent px-4 py-2 text-sm font-semibold text-bg hover:bg-accent-600 disabled:opacity-45"
        >
          Close and tell the reporter
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-muted text-xs font-semibold hover:text-ink"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
