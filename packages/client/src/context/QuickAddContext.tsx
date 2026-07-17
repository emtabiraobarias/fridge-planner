'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ParsedQuickItem } from '../lib/quick-parse';
import { daysLeft } from '../lib/quick-parse';
import type { OverridableField } from '../lib/quick-add-overrides';
import {
  assistParse,
  getAliases,
  putAlias,
  type AssistInterpretation,
  type QuickAddAlias,
} from '../services/quick-add';

/**
 * Per-user quick-add alias memory (spec 005 US3). Loads the user's learned
 * aliases once (lazily, on the first enhance call), merges them into parse
 * results as `learned` provenance — explicit text always wins (FR-IQ-016) —
 * and records corrections + explicitly-typed expiry observations back.
 * Learned data only supplies defaults; failures are silent (FR-IQ-018).
 */

const ALIAS_FIELDS = ['category', 'location', 'unit'] as const;
type AliasField = (typeof ALIAS_FIELDS)[number];

interface QuickAddContextValue {
  ready: boolean;
  /** Merge learned aliases into freshly parsed items (pure w.r.t. its inputs). */
  enhance: (items: ParsedQuickItem[], today?: Date) => ParsedQuickItem[];
  /** Learn from a chip correction (category/location/unit only). */
  recordCorrection: (
    item: ParsedQuickItem,
    field: OverridableField,
    value: string | number | null,
  ) => void;
  /** Record a shelf-life observation when an add carries an explicitly stated expiry. */
  recordAdd: (item: ParsedQuickItem, today?: Date) => void;
  /** Debounced AI-assist request for a low-confidence item; fail-open, at most one in flight (US4/D7). */
  requestAssist: (item: ParsedQuickItem) => void;
}

const noopValue: QuickAddContextValue = {
  ready: false,
  enhance: (items) => items,
  recordCorrection: () => undefined,
  recordAdd: () => undefined,
  requestAssist: () => undefined,
};

const QuickAddContext = createContext<QuickAddContextValue>(noopValue);

function nameKey(name: string): string {
  return name.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isoDatePlusDays(days: number, today: Date): string {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function mergeAlias(item: ParsedQuickItem, alias: QuickAddAlias, today: Date): ParsedQuickItem {
  const out: ParsedQuickItem = { ...item, provenance: { ...item.provenance } };
  for (const field of ALIAS_FIELDS) {
    const learned = alias[field];
    // Learned ranks below explicit text and above built-in guesses (FR-IQ-016).
    if (learned && out.provenance[field] === 'guess') {
      out[field] = learned as never;
      out.provenance[field] = 'learned';
    }
  }
  if (!out.expiresAt && alias.suggestedShelfLifeDays !== undefined) {
    out.suggestedExpiresAt = isoDatePlusDays(alias.suggestedShelfLifeDays, today);
  }
  return out;
}

const ASSIST_DEBOUNCE_MS = 600;

function mergeAssist(
  item: ParsedQuickItem,
  assist: AssistInterpretation,
  today: Date,
): ParsedQuickItem {
  const out: ParsedQuickItem = { ...item, provenance: { ...item.provenance } };
  for (const field of ALIAS_FIELDS) {
    const value = assist[field];
    // Assisted ranks below explicit text and learned aliases (FR-IQ-016/020).
    if (value && out.provenance[field] === 'guess') {
      out[field] = value as never;
      out.provenance[field] = 'assisted';
    }
  }
  if (assist.quantity !== undefined && out.provenance.quantity === 'guess') {
    out.quantity = assist.quantity;
    out.provenance.quantity = 'assisted';
  }
  if (assist.shelfLifeDays !== undefined && !out.expiresAt && !out.suggestedExpiresAt) {
    out.suggestedExpiresAt = isoDatePlusDays(assist.shelfLifeDays, today);
  }
  return out;
}

export function QuickAddProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [aliases, setAliases] = useState<Map<string, QuickAddAlias> | null>(null);
  const loadStarted = useRef(false);
  const assistResults = useRef(new Map<string, AssistInterpretation | null>());
  const assistRequested = useRef(new Set<string>());
  const assistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, bumpAssistVersion] = useState(0);

  const ensureLoaded = useCallback((): void => {
    if (loadStarted.current) return;
    loadStarted.current = true;
    getAliases()
      .then((list) => setAliases(new Map(list.map((a) => [a.nameKey, a]))))
      .catch(() => setAliases(new Map())); // alias memory is best-effort — never break the parse
  }, []);

  const enhance = useCallback(
    (items: ParsedQuickItem[], today: Date = new Date()): ParsedQuickItem[] => {
      if (items.length > 0) ensureLoaded();
      return items.map((item) => {
        const alias = aliases?.get(nameKey(item.name));
        const merged = alias ? mergeAlias(item, alias, today) : item;
        const assist = assistResults.current.get(nameKey(item.name));
        return assist ? mergeAssist(merged, assist, today) : merged;
      });
    },
    [aliases, ensureLoaded],
  );

  const requestAssist = useCallback((item: ParsedQuickItem): void => {
    // Only the fallback category counts as low confidence (research D7).
    if (item.category !== 'Other' || item.provenance.category !== 'guess') return;
    const key = nameKey(item.name);
    if (!key || assistRequested.current.has(key)) return;
    if (assistTimer.current) clearTimeout(assistTimer.current); // debounce: latest wins
    assistTimer.current = setTimeout(() => {
      if (assistRequested.current.has(key)) return;
      assistRequested.current.add(key);
      assistParse(item.name)
        .then((interpretation) => {
          assistResults.current.set(key, interpretation);
          bumpAssistVersion((v) => v + 1); // re-render so enhance picks the result up
        })
        .catch(() => assistResults.current.set(key, null)); // fail-open, no retry this session
    }, ASSIST_DEBOUNCE_MS);
  }, []);

  const recordCorrection = useCallback(
    (item: ParsedQuickItem, field: OverridableField, value: string | number | null): void => {
      if (!ALIAS_FIELDS.includes(field as AliasField) || typeof value !== 'string') return;
      const key = nameKey(item.name);
      void putAlias(key, { [field]: value }).catch(() => undefined);
      // Keep the local cache in step so the next parse reflects the correction.
      setAliases((cur) => {
        const next = new Map(cur ?? []);
        next.set(key, { ...next.get(key), nameKey: key, [field]: value });
        return next;
      });
    },
    [],
  );

  const recordAdd = useCallback((item: ParsedQuickItem, today: Date = new Date()): void => {
    // Only explicitly stated expiries become observations — a suggestion-accepted
    // expiry would feed the median back to itself (analyze U2).
    if (!item.expiresAt || item.provenance.expiresAt !== 'explicit') return;
    const days = daysLeft(item.expiresAt, today);
    if (days === null || days < 0 || days > 365) return;
    void putAlias(nameKey(item.name), { observedShelfLifeDays: days }).catch(() => undefined);
  }, []);

  return (
    <QuickAddContext.Provider
      value={{ ready: aliases !== null, enhance, recordCorrection, recordAdd, requestAssist }}
    >
      {children}
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd(): QuickAddContextValue {
  return useContext(QuickAddContext);
}
