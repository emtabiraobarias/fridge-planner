'use client';
import { useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { parseQuickAll, type ParsedQuick, type ParsedQuickItem } from '../../lib/quick-parse';
import {
  applyOverrides,
  setOverride,
  type OverrideMap,
  type OverridableField,
} from '../../lib/quick-add-overrides';
import { ParsePreview } from '../shared/ParsePreview';
import { useQuickAdd } from '../../context/QuickAddContext';

interface Props {
  onAdd: (parsed: ParsedQuick) => void;
}

const STAPLES = ['Milk', 'Eggs', 'Bread', 'Butter', 'Bananas', 'Chicken'];

/** Apply a tapped shelf-life suggestion: expiry set as `learned` (never an observation — analyze U2). */
function withAcceptedSuggestions(
  items: ParsedQuickItem[],
  accepted: Record<string, string>,
): ParsedQuickItem[] {
  return items.map((item) => {
    const date = accepted[item.name.toLowerCase()];
    if (!date || item.expiresAt) return item;
    return { ...item, expiresAt: date, provenance: { ...item.provenance, expiresAt: 'learned' } };
  });
}

/** Natural-language smart quick-add with tap-to-correct parse preview + staple chips (spec 004 §3.1, 005 US1-US3). */
export function QuickAdd({ onAdd }: Props): React.JSX.Element {
  const { enhance, recordCorrection, recordAdd, requestAssist } = useQuickAdd();
  const [text, setText] = useState('');
  const [overrides, setOverrides] = useState<OverrideMap>({});
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  // Pipeline: deterministic parse → learned-alias merge → user corrections → accepted suggestions.
  const enhanced = enhance(parseQuickAll(text));
  const { items: corrected } = applyOverrides(enhanced, overrides);
  const parsed = withAcceptedSuggestions(corrected, accepted);

  // AI assist for the low-confidence long tail — debounced + fail-open in the context (US4).
  useEffect(() => {
    const target = enhanced.find((i) => i.category === 'Other' && i.provenance.category === 'guess');
    if (target) requestAssist(target);
  }, [enhanced, requestAssist]);

  function handleCorrect(
    item: ParsedQuickItem,
    field: OverridableField,
    value: string | number | null,
  ): void {
    // Record against the pre-override item so `replaced` compares to what the text+aliases yield (research D3).
    const base = enhanced.find((r) => r.name.toLowerCase() === item.name.toLowerCase());
    if (!base) return;
    setOverrides((m) => setOverride(m, base, field, value));
    recordCorrection(base, field, value);
  }

  function handleAcceptSuggestion(item: ParsedQuickItem): void {
    if (!item.suggestedExpiresAt) return;
    setAccepted((m) => ({ ...m, [item.name.toLowerCase()]: item.suggestedExpiresAt! }));
  }

  function submit(): void {
    if (parsed.length === 0) return;
    parsed.forEach((item) => {
      onAdd(item);
      recordAdd(item);
    });
    setText('');
    setOverrides({});
    setAccepted({});
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

      <ParsePreview items={parsed} onCorrect={handleCorrect} onAcceptSuggestion={handleAcceptSuggestion} />

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
