'use client';
import { useCallback, useEffect, useState } from 'react';
import {
  fetchReadiness,
  fetchSettings,
  fetchUsage,
  fetchLimits,
  patchSettings,
  flushCache,
  resetLimit,
  type ReadinessReport,
  type DependencyStatus,
  type UsageRow,
  type LimiterBucketView,
} from '../../services/admin';

/**
 * Operational visibility & control (spec 011 US4 — FR-AD-024..029).
 *
 * The API for all of this shipped in 4.12.0 with no surface at all, which made the
 * feature true but unusable: the kill switch existed only as a `PATCH` an operator had
 * to hand-craft, and readiness could only be read by curling the endpoint. This panel is
 * that missing surface — it adds **no** capability the server does not already enforce.
 *
 * Nothing here is gated on a rendered control: every action below is refused server-side
 * for a non-administrator (FR-AD-002), and the refusal matrix proves it by invoking the
 * handlers directly, with no component involved.
 */

// Stays inside the organic palette (spec 004) — it has no red or amber, so severity is
// carried by weight instead of hue: green ok → light orange degraded → dark orange down.
const STATUS_TONE: Record<DependencyStatus, string> = {
  ok: 'bg-accent2-100 text-accent2-800',
  degraded: 'bg-accent-200 text-accent-800',
  down: 'bg-accent-800 text-bg',
  'not-configured': 'bg-neutral-200 text-neutral-700',
};

function DependencyRow({
  report,
}: {
  report: { name: string; status: DependencyStatus };
}): React.JSX.Element {
  return (
    <li className="flex items-center justify-between gap-3 text-[14px] text-ink">
      <span>{report.name}</span>
      <span
        className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${
          STATUS_TONE[report.status]
        }`}
        data-testid={`dependency-${report.name}`}
      >
        {report.status}
      </span>
    </li>
  );
}

/**
 * Readiness names the dependency that is down while the app keeps serving (SC-AD-005).
 * A 503 from `/api/health/ready` is a successful *read* here — it is exactly the state
 * an operator opened this panel to see — so it renders as data, never as an error.
 */
function Readiness({ report }: { report: ReadinessReport | null }): React.JSX.Element {
  if (!report) return <p className="text-[14px] text-ink-soft">Loading…</p>;
  return (
    <>
      <p className="text-[13px] text-ink-soft" data-testid="readiness-overall">
        {report.ready ? 'Ready' : 'Not ready'} · version {report.version}
      </p>
      <ul className="mt-2 flex flex-col gap-1" aria-label="Dependencies">
        {report.dependencies.map((d) => (
          <DependencyRow key={d.name} report={d} />
        ))}
      </ul>
    </>
  );
}

function UsageTable({ rows }: { rows: UsageRow[] }): React.JSX.Element {
  if (rows.length === 0) {
    return <p className="text-[14px] text-ink-soft">No model calls recorded.</p>;
  }
  return (
    <ul className="flex flex-col gap-1" aria-label="AI usage">
      {rows.map((r) => (
        <li key={`${r.day}:${r.feature}`} className="text-[14px] text-ink">
          {r.day} · {r.feature} — <span className="font-semibold">{r.count}</span>
        </li>
      ))}
    </ul>
  );
}

function Limits({
  buckets,
  onReset,
}: {
  buckets: LimiterBucketView[];
  onReset: (key: string) => void;
}): React.JSX.Element {
  if (buckets.length === 0) {
    return <p className="text-[14px] text-ink-soft">No active rate-limit buckets.</p>;
  }
  return (
    <ul className="flex flex-col gap-1" aria-label="Rate limit buckets">
      {buckets.map((b) => (
        <li key={b.key} className="flex items-center justify-between gap-3 text-[14px] text-ink">
          <span className="truncate">
            {b.key} — {b.count}
          </span>
          <button
            type="button"
            onClick={() => onReset(b.key)}
            className="shrink-0 rounded-full bg-accent-100 px-3 py-1 text-[12px] font-semibold text-accent-800"
          >
            Reset
          </button>
        </li>
      ))}
    </ul>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <section className="rounded-[20px] bg-surface p-5 shadow-sm" aria-label={title}>
      <h3 className="font-heading text-[16px] text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function OpsPanel(): React.JSX.Element {
  const [readiness, setReadiness] = useState<ReadinessReport | null>(null);
  const [aiEnabled, setAiEnabled] = useState<boolean | null>(null);
  const [usage, setUsage] = useState<UsageRow[]>([]);
  const [buckets, setBuckets] = useState<LimiterBucketView[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<void> => {
    try {
      const [r, s, u, l] = await Promise.all([
        fetchReadiness(),
        fetchSettings(),
        fetchUsage(),
        fetchLimits(),
      ]);
      setReadiness(r);
      setAiEnabled(s['ai.enabled']);
      setUsage(u);
      setBuckets(l);
      setError(null);
    } catch {
      setError('Could not load operational status.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // The kill switch (FR-AD-026). Flipping it off makes every AI-backed journey fall back
  // to its existing non-AI path rather than error — the guard sits at the service
  // boundary, so the effect is identical whichever caller asks.
  const toggleAi = useCallback(async (): Promise<void> => {
    try {
      const next = await patchSettings({ 'ai.enabled': !aiEnabled });
      setAiEnabled(next['ai.enabled']);
      setNotice(next['ai.enabled'] ? 'AI features enabled.' : 'AI features disabled.');
    } catch {
      setError('Could not change the AI kill switch.');
    }
  }, [aiEnabled]);

  const onFlush = useCallback(async (): Promise<void> => {
    try {
      await flushCache();
      setNotice('Cached AI results flushed.');
    } catch {
      setError('Could not flush the cache.');
    }
  }, []);

  const onResetLimit = useCallback(
    async (key: string): Promise<void> => {
      try {
        await resetLimit(key);
        setNotice(`Rate limit reset for ${key}.`);
        await load();
      } catch {
        setError('Could not reset that limit.');
      }
    },
    [load],
  );

  return (
    <div className="flex flex-col gap-4" data-testid="ops-panel">
      {error && <p className="text-[14px] text-accent-800">{error}</p>}
      {notice && (
        <p className="text-[14px] text-ink-soft" role="status">
          {notice}
        </p>
      )}

      <Card title="Readiness">
        <Readiness report={readiness} />
      </Card>

      <Card title="AI features">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[14px] text-ink" data-testid="ai-state">
            {aiEnabled === null ? 'Loading…' : aiEnabled ? 'Enabled' : 'Disabled'}
          </span>
          <button
            type="button"
            onClick={() => void toggleAi()}
            disabled={aiEnabled === null}
            aria-pressed={aiEnabled === true}
            className="rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-bg disabled:opacity-50"
          >
            {aiEnabled ? 'Disable AI' : 'Enable AI'}
          </button>
        </div>
        <p className="mt-2 text-[13px] text-ink-soft">
          Disabling stops all model calls. Journeys still complete on their existing non-AI
          fallbacks.
        </p>
      </Card>

      <Card title="Model usage">
        <UsageTable rows={usage} />
      </Card>

      <Card title="Cache">
        <button
          type="button"
          onClick={() => void onFlush()}
          className="rounded-full bg-accent-100 px-4 py-2 text-[13px] font-semibold text-accent-800"
        >
          Flush cached AI results
        </button>
      </Card>

      <Card title="Rate limits">
        <Limits buckets={buckets} onReset={(key) => void onResetLimit(key)} />
      </Card>
    </div>
  );
}
