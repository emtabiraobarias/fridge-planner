'use client';
import { useCallback, useEffect, useState } from 'react';
import { fetchSettings, patchSettings, type RuntimeSettings } from '../../services/admin';

/**
 * Runtime-adjustable operational content (spec 011 US7 — FR-AD-030).
 *
 * Everything here has a **code-owned default**, so an untouched system behaves exactly as
 * it did before this panel existed — an empty overrides collection is a no-op, not an
 * unconfigured state. Editing a value takes effect without a restart.
 *
 * The AI kill switch is the third runtime setting but lives in `OpsPanel`: it is an
 * operational lever pulled during an incident, not content someone tunes.
 *
 * Validation is the server's (all-or-nothing). A rejected value leaves the prior one in
 * force, so this panel reloads from the response rather than keeping optimistic state.
 */
export function SettingsPanel(): React.JSX.Element {
  const [settings, setSettings] = useState<RuntimeSettings | null>(null);
  const [domains, setDomains] = useState('');
  const [limit, setLimit] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = useCallback((next: RuntimeSettings): void => {
    setSettings(next);
    setDomains(next['recipes.approvedDomains'].join('\n'));
    setLimit(String(next['limits.recommendationsPerMinute']));
  }, []);

  useEffect(() => {
    fetchSettings()
      .then(apply)
      .catch(() => setError('Could not load settings.'));
  }, [apply]);

  const save = useCallback(async (): Promise<void> => {
    setNotice(null);
    setError(null);
    const parsedLimit = Number(limit);
    if (!Number.isFinite(parsedLimit)) {
      setError('The rate limit must be a number.');
      return;
    }
    try {
      const next = await patchSettings({
        'recipes.approvedDomains': domains
          .split('\n')
          .map((d) => d.trim())
          .filter(Boolean),
        'limits.recommendationsPerMinute': parsedLimit,
      });
      apply(next);
      setNotice('Saved. In effect immediately — no restart.');
    } catch {
      // The server validates before writing, so a rejection means NOTHING changed.
      setError('Rejected. The previous values are still in force.');
    }
  }, [apply, domains, limit]);

  if (!settings && !error) return <p className="text-[14px] text-ink-soft">Loading…</p>;

  return (
    <section
      className="rounded-[20px] bg-surface p-5 shadow-sm"
      aria-label="Runtime settings"
      data-testid="settings-panel"
    >
      <h3 className="font-heading text-[16px] text-ink">Runtime settings</h3>

      <label className="mt-3 block text-[13px] font-semibold text-ink" htmlFor="approved-domains">
        Approved recipe domains (one per line)
      </label>
      <textarea
        id="approved-domains"
        value={domains}
        onChange={(e) => setDomains(e.target.value)}
        rows={5}
        className="mt-1 w-full rounded-[16px] bg-bg px-4 py-2 font-mono text-[13px] text-ink"
      />

      <label className="mt-3 block text-[13px] font-semibold text-ink" htmlFor="recs-limit">
        Recommendations per minute
      </label>
      <input
        id="recs-limit"
        value={limit}
        inputMode="numeric"
        onChange={(e) => setLimit(e.target.value)}
        className="mt-1 w-32 rounded-[16px] bg-bg px-4 py-2 text-[14px] text-ink"
      />

      <div className="mt-4">
        <button
          type="button"
          onClick={() => void save()}
          className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-bg"
        >
          Save settings
        </button>
      </div>

      {error && (
        <p className="mt-3 text-[14px] text-accent-800" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-3 text-[14px] text-ink" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
