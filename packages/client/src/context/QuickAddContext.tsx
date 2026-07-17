'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ParsedQuickItem } from '../lib/quick-parse';
import { daysLeft } from '../lib/quick-parse';
import type { OverridableField } from '../lib/quick-add-overrides';
import { getAliases, putAlias, type QuickAddAlias } from '../services/quick-add';

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
}

const noopValue: QuickAddContextValue = {
  ready: false,
  enhance: (items) => items,
  recordCorrection: () => undefined,
  recordAdd: () => undefined,
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

export function QuickAddProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [aliases, setAliases] = useState<Map<string, QuickAddAlias> | null>(null);
  const loadStarted = useRef(false);

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
      if (!aliases) return items;
      return items.map((item) => {
        const alias = aliases.get(nameKey(item.name));
        return alias ? mergeAlias(item, alias, today) : item;
      });
    },
    [aliases, ensureLoaded],
  );

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
    <QuickAddContext.Provider value={{ ready: aliases !== null, enhance, recordCorrection, recordAdd }}>
      {children}
    </QuickAddContext.Provider>
  );
}

export function useQuickAdd(): QuickAddContextValue {
  return useContext(QuickAddContext);
}
