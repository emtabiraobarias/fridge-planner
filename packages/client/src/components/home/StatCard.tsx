export type StatTone = 'accent' | 'accent2' | 'ink' | 'surface';

interface StatCardProps {
  label: string;
  value: number | string;
  tone: StatTone;
}

/** Per-tone background/text pairing (design §4.1.2 — the four stat cards). */
const TONE_CLASS: Record<StatTone, string> = {
  accent: 'bg-accent text-bg',
  accent2: 'bg-accent2-500 text-bg',
  ink: 'bg-neutral-900 text-bg',
  surface: 'bg-surface text-ink',
};

const LABEL_CLASS: Record<StatTone, string> = {
  accent: 'text-bg',
  accent2: 'text-bg',
  ink: 'text-bg/85',
  surface: 'text-muted',
};

/**
 * One Home dashboard stat tile (spec 010 US5, design §4.1.2). All four figures
 * are reads of data already held by an app-level context — no fetch happens
 * here (FR-RS-020).
 */
export function StatCard({ label, value, tone }: StatCardProps): React.JSX.Element {
  return (
    <div className={`rounded-[22px] p-[17px] ${TONE_CLASS[tone]}`}>
      <p className="font-heading text-[36px] leading-none">{value}</p>
      <p className={`mt-[5px] text-[12px] font-semibold ${LABEL_CLASS[tone]}`}>{label}</p>
    </div>
  );
}
