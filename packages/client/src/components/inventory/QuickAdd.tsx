'use client';
import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { parseQuickAll, type ParsedQuick, type ParsedQuickItem } from '../../lib/quick-parse';
import {
  applyOverrides,
  setOverride,
  type OverrideMap,
  type OverridableField,
} from '../../lib/quick-add-overrides';
import { ParsePreview } from '../shared/ParsePreview';

interface Props {
  onAdd: (parsed: ParsedQuick) => void;
}

const STAPLES = ['Milk', 'Eggs', 'Bread', 'Butter', 'Bananas', 'Chicken'];

/** Natural-language smart quick-add with tap-to-correct parse preview + staple chips (spec 004 §3.1, 005 US1/US2). */
export function QuickAdd({ onAdd }: Props): React.JSX.Element {
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const parsedRaw = parseQuickAll(text);
  const { items: parsed } = applyOverrides(parsedRaw, overrides);

  function handleCorrect(
    item: ParsedQuickItem,
    field: OverridableField,
    value: string | number | null,
  ): void {
    // Record against the RAW parse so `replaced` compares to what the text yields (research D3).
    const raw = parsedRaw.find((r) => r.name.toLowerCase() === item.name.toLowerCase());
    if (!raw) return;
    setOverrides((m) => setOverride(m, raw, field, value));
  }

  function submit(): void {
    if (parsed.length === 0) return;
    parsed.forEach((item) => onAdd(item));
    setText('');
    setOverrides({});
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

      <ParsePreview items={parsed} onCorrect={handleCorrect} />

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
