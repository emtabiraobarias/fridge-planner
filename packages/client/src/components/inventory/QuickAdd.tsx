'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { parseQuick, type ParsedQuick } from '../../lib/quick-parse';

interface Props {
  onAdd: (parsed: ParsedQuick) => void;
}

const STAPLES = ['Milk', 'Eggs', 'Bread', 'Butter', 'Bananas', 'Chicken'];

function formatExpiry(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString('en-AU', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** Natural-language smart quick-add with live parse preview + staple chips (spec 004 §3.1). */
export function QuickAdd({ onAdd }: Props): React.JSX.Element {
  const [text, setText] = useState('');
  const parsed = parseQuick(text);

  function submit(): void {
    const p = parseQuick(text);
    if (!p) return;
    onAdd(p);
    setText('');
  }

  return (
    <section aria-label="Add to your kitchen" className="rounded-lg bg-surface p-6 shadow-sm">
      <h2 className="font-heading text-h4 text-ink">Add to your kitchen</h2>
      <p className="text-muted mb-3 text-xs">type it like you&apos;d say it</p>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Sparkles
            size={18}
            strokeWidth={2.75}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-accent"
          />
          <input
            type="text"
            aria-label="Quick add item"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit();
            }}
            placeholder="2L milk expires friday · 500g mince · 6 eggs…"
            className="min-h-[46px] w-full rounded-full bg-neutral-100 pl-10 pr-4 text-[15px] text-ink placeholder:text-muted"
          />
        </div>
        <button
          type="button"
          onClick={submit}
          className="min-h-[46px] rounded-full bg-accent px-5 font-semibold text-bg hover:bg-accent-600"
        >
          Add
        </button>
      </div>

      {parsed && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-muted text-xs">I&apos;ll add:</span>
          <span className="rounded-full bg-accent-100 px-2.5 py-1 text-[11px] font-semibold text-accent-800">
            {parsed.name}
          </span>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[11px] text-neutral-800">
            {parsed.quantity} {parsed.unit}
          </span>
          <span className="rounded-full bg-accent2-100 px-2.5 py-1 text-[11px] text-accent2-800">
            {parsed.category} · {parsed.location}
          </span>
          {parsed.expiresAt && (
            <span className="rounded-full bg-accent-200 px-2.5 py-1 text-[11px] font-semibold text-accent-800">
              expires {formatExpiry(parsed.expiresAt)}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-muted text-xs">Staples:</span>
        {STAPLES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setText(s.toLowerCase())}
            className="rounded-full bg-neutral-100 px-3 py-[5px] text-xs text-neutral-800 hover:bg-neutral-300"
          >
            + {s}
          </button>
        ))}
      </div>
    </section>
  );
}
