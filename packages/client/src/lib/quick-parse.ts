import type { Category, Location } from '../services/inventory';

/**
 * Natural-language quick-add parser + expiry/stepper helpers (spec 004 / Phase G).
 * Canonical algorithm + worked examples: specs/004-organic-redesign/design/reference-logic.md
 * Pure and client-side — produces the structured payloads the existing inventory/grocery APIs accept.
 */

export interface ParsedQuick {
  name: string;
  quantity: number;
  unit: string;
  category: Category;
  location: Location;
  expiresAt: string | null;
}

/** Where a parsed field's value came from — drives chip styling + precedence (spec 005 FR-IQ-011/016). */
export type Provenance = 'explicit' | 'learned' | 'assisted' | 'guess';

export interface FieldProvenance {
  quantity: Provenance;
  unit: Provenance;
  category: Provenance;
  location: Provenance;
  expiresAt: Provenance;
}

export interface ParsedQuickItem extends ParsedQuick {
  provenance: FieldProvenance;
  /** Alias-memory shelf-life suggestion — applied only when the user taps it (FR-IQ-017). */
  suggestedExpiresAt?: string;
}

const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

/**
 * Unit words → canonical display unit (spec 005 FR-IQ-002). Units are display vocabulary,
 * not a server enum — synonyms map to an existing canonical unit where one fits (tin → can)
 * and gain a new canonical entry where none does (bottle).
 */
const UNIT_SYNONYMS: Record<string, string> = {
  g: 'g',
  gram: 'g',
  grams: 'g',
  kg: 'kg',
  kilo: 'kg',
  kilos: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  l: 'L',
  litre: 'L',
  litres: 'L',
  liter: 'L',
  liters: 'L',
  ml: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  milliliter: 'ml',
  milliliters: 'ml',
  count: 'count',
  x: 'count',
  pcs: 'pcs',
  piece: 'pcs',
  pieces: 'pcs',
  pack: 'pack',
  packs: 'pack',
  packet: 'pack',
  packets: 'pack',
  bag: 'bag',
  bags: 'bag',
  can: 'can',
  cans: 'can',
  tin: 'can',
  tins: 'can',
  bottle: 'bottle',
  bottles: 'bottle',
  dozen: 'dozen',
  bunch: 'bunch',
  jar: 'jar',
  jars: 'jar',
  loaf: 'loaf',
  loaves: 'loaf',
};

function canonicalUnit(word: string): string | null {
  return UNIT_SYNONYMS[word.toLowerCase()] ?? null;
}

const LOCATION_WORDS = ['fridge', 'freezer', 'pantry'] as const;

const CAT_GUESS: readonly (readonly [RegExp, Category, Location])[] = [
  [/milk|yogurt|yoghurt|cheese|butter|cream|feta|egg/i, 'Dairy', 'fridge'],
  [/chicken|beef|pork|mince|lamb|bacon|sausage/i, 'Meat', 'fridge'],
  [/salmon|fish|prawn|shrimp|tuna/i, 'Seafood', 'fridge'],
  [
    /spinach|tomato|lettuce|apple|banana|carrot|cucumber|lemon|onion|garlic|capsicum|broccoli|potato|avocado|berr/i,
    'Produce',
    'fridge',
  ],
  [/rice|pasta|bread|oat|flour|noodle|quinoa/i, 'Grains', 'pantry'],
  [/frozen|ice cream|peas/i, 'Frozen', 'freezer'],
  [/oil|sauce|ketchup|mayo|mustard|vinegar|honey|jam/i, 'Condiments', 'pantry'],
];

function midnight(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Format a Date to a local `yyyy-mm-dd` string (no UTC shift). */
function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function titleCase(name: string): string {
  return name.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** day-of-month + month index → date, rolled to next year when already past (FR-IQ-004). */
function dayMonthDate(dd: number, monthIdx: number, base: Date): Date {
  const d = new Date(base.getFullYear(), monthIdx, dd);
  return d < base ? new Date(base.getFullYear() + 1, monthIdx, dd) : d;
}

function monthIndex(token: string): number {
  if (token.length < 3 || !/^[a-z]+$/.test(token)) return -1;
  return MONTHS.findIndex((m) => m.startsWith(token));
}

/** Resolve a single `expires <token>` token to a Date, or null if unrecognised. */
function resolveExpiryToken(token: string, base: Date): Date | null {
  if (token === 'today') return new Date(base);
  if (token === 'tomorrow') {
    const d = new Date(base);
    d.setDate(d.getDate() + 1);
    return d;
  }
  const rel = token.match(/^(\d+)\s*(d|w)$/);
  if (rel) {
    const d = new Date(base);
    d.setDate(d.getDate() + Number(rel[1]) * (rel[2] === 'w' ? 7 : 1));
    return d;
  }
  if (/^\d{1,2}\/\d{1,2}$/.test(token)) {
    const [dd, mm] = token.split('/').map(Number) as [number, number];
    return dayMonthDate(dd, mm - 1, base);
  }
  const dowIdx = DOW.findIndex((n) => n.startsWith(token.slice(0, 3)));
  if (dowIdx >= 0 && token.length >= 3) {
    const d = new Date(base);
    let diff = (dowIdx - d.getDay() + 7) % 7;
    if (diff === 0) diff = 7; // never today → next occurrence
    d.setDate(d.getDate() + diff);
    return d;
  }
  return null;
}

/** Resolve a two-word token: "16 july" or "jul 16" (FR-IQ-003). */
function resolveExpiryTokenPair(tok1: string, tok2: string, base: Date): Date | null {
  if (/^\d{1,2}$/.test(tok1) && monthIndex(tok2) >= 0) {
    return dayMonthDate(Number(tok1), monthIndex(tok2), base);
  }
  if (monthIndex(tok1) >= 0 && /^\d{1,2}$/.test(tok2)) {
    return dayMonthDate(Number(tok2), monthIndex(tok1), base);
  }
  return null;
}

/**
 * Strip an expiry clause — keywords `expires|exp|use by|use-by|best before`,
 * tokens incl. today/tomorrow/weekday/Nd/Nw/dd-mm/month-name (FR-IQ-003).
 * An unresolvable token strips nothing (clause kept whole in the name).
 */
function extractExpiry(t: string, base: Date): { text: string; expiresAt: Date | null } {
  const m = t.match(
    /\b(?:exp(?:ires?)?|use[\s-]by|best[\s-]before)\s+([a-z0-9/]+)(?:\s+([a-z0-9/]+))?/i,
  );
  if (!m) return { text: t, expiresAt: null };
  const tok1 = m[1]!.toLowerCase();
  const tok2 = m[2]?.toLowerCase();
  if (tok2) {
    const pair = resolveExpiryTokenPair(tok1, tok2, base);
    if (pair) return { text: t.replace(m[0], '').trim(), expiresAt: pair };
  }
  const single = resolveExpiryToken(tok1, base);
  if (!single) return { text: t, expiresAt: null };
  // Strip only keyword + first token — a second captured word belongs to the name.
  const stripped = tok2 ? m[0].slice(0, m[0].lastIndexOf(m[2]!)).trimEnd() : m[0];
  return { text: t.replace(stripped, '').replace(/\s+/g, ' ').trim(), expiresAt: single };
}

/**
 * Strip an explicit storage-location phrase — "in (the) X" / "to (the) X" anywhere,
 * or a bare location word ending the segment (FR-IQ-001). Category keywords
 * ("frozen") are never location phrases and stay in the name.
 */
function extractLocation(t: string): { text: string; location: Location | null } {
  const words = LOCATION_WORDS.join('|');
  const prep = t.match(new RegExp(`\\b(?:in|to)\\s+(?:the\\s+)?(${words})\\b`, 'i'));
  if (prep) {
    const text = t.replace(prep[0], '').replace(/\s+/g, ' ').trim();
    return { text, location: prep[1]!.toLowerCase() as Location };
  }
  const bare = t.match(new RegExp(`\\s+(${words})\\s*$`, 'i'));
  if (bare) {
    return { text: t.slice(0, bare.index).trim(), location: bare[1]!.toLowerCase() as Location };
  }
  return { text: t, location: null };
}

interface QuantityResult {
  text: string;
  quantity: number;
  unit: string;
  quantityExplicit: boolean;
  unitExplicit: boolean;
}

/** Strip a leading quantity (+ optional unit), e.g. "2L milk", "500 grams mince", "6x eggs". */
function extractLeadingQuantity(t: string): QuantityResult | null {
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+/);
  if (!m) return null;
  const quantity = Number(m[1]);
  const u = m[2] ?? '';
  const unit = u ? canonicalUnit(u) : null;
  if (unit) {
    return { text: t.slice(m[0].length), quantity, unit, quantityExplicit: true, unitExplicit: true };
  }
  if (!u) {
    return {
      text: t.slice(m[0].length),
      quantity,
      unit: 'count',
      quantityExplicit: true,
      unitExplicit: false,
    };
  }
  // group2 is the item word, not a unit — keep it as part of the name.
  return {
    text: t.slice(m[1]!.length).trim(),
    quantity,
    unit: 'count',
    quantityExplicit: true,
    unitExplicit: false,
  };
}

/** Strip a trailing quantity — "milk 2L", "eggs x6", "milk 2" (FR-IQ-005). */
function extractTrailingQuantity(t: string): QuantityResult | null {
  const xForm = t.match(/\s+x\s*(\d+(?:\.\d+)?)$/i);
  if (xForm) {
    return {
      text: t.slice(0, xForm.index).trim(),
      quantity: Number(xForm[1]),
      unit: 'count',
      quantityExplicit: true,
      unitExplicit: true,
    };
  }
  const withUnit = t.match(/\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]+)$/);
  if (withUnit) {
    const unit = canonicalUnit(withUnit[2]!);
    if (!unit) return null; // non-unit trailing word — never treat it as one (FR-IQ-002)
    return {
      text: t.slice(0, withUnit.index).trim(),
      quantity: Number(withUnit[1]),
      unit,
      quantityExplicit: true,
      unitExplicit: true,
    };
  }
  const bare = t.match(/\s+(\d+(?:\.\d+)?)$/);
  if (bare) {
    return {
      text: t.slice(0, bare.index).trim(),
      quantity: Number(bare[1]),
      unit: 'count',
      quantityExplicit: true,
      unitExplicit: false,
    };
  }
  return null;
}

function guessCategoryLocation(name: string): [Category, Location] {
  for (const [re, cat, loc] of CAT_GUESS) {
    if (re.test(name)) return [cat, loc];
  }
  return ['Other', 'fridge'];
}

/** Leading quantity wins over trailing (FR-IQ-005); default is an implicit 1 count. */
function extractQuantity(t: string): QuantityResult {
  return (
    extractLeadingQuantity(t) ??
    extractTrailingQuantity(t) ?? {
      text: t,
      quantity: 1,
      unit: 'count',
      quantityExplicit: false,
      unitExplicit: false,
    }
  );
}

function assembleItem(
  name: string,
  qty: QuantityResult,
  category: Category,
  explicitLocation: Location | null,
  guessLocation: Location,
  expiresAt: Date | null,
): ParsedQuickItem {
  return {
    name,
    quantity: qty.quantity,
    unit: qty.unit,
    category,
    location: explicitLocation ?? guessLocation,
    expiresAt: expiresAt ? toISODate(expiresAt) : null,
    provenance: {
      quantity: qty.quantityExplicit ? 'explicit' : 'guess',
      unit: qty.unitExplicit ? 'explicit' : 'guess',
      category: 'guess',
      location: explicitLocation ? 'explicit' : 'guess',
      expiresAt: expiresAt ? 'explicit' : 'guess',
    },
  };
}

export function parseQuick(text: string, today: Date = new Date()): ParsedQuickItem | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const base = midnight(today);
  const afterExpiry = extractExpiry(trimmed, base);
  const afterLocation = extractLocation(afterExpiry.text);
  const qty = extractQuantity(afterLocation.text);

  const name = qty.text.replace(/\s+/g, ' ').trim();
  // No usable name (empty, or a bare number like "12" with nothing else) → add nothing.
  if (!name || /^\d+(\.\d+)?$/.test(name)) return null;

  const [category, guessLocation] = guessCategoryLocation(name);
  return assembleItem(
    titleCase(name),
    qty,
    category,
    afterLocation.location,
    guessLocation,
    afterExpiry.expiresAt,
  );
}

/**
 * Parse a comma-separated multi-item input; empty and bare-number segments
 * are skipped without failing the whole input (FR-IQ-006).
 */
export function parseQuickAll(text: string, today: Date = new Date()): ParsedQuickItem[] {
  return text
    .split(',')
    .map((segment) => parseQuick(segment, today))
    .filter((item): item is ParsedQuickItem => item !== null);
}

/**
 * Read the calendar date out of an ISO string — whether date-only (`2026-07-17`)
 * or a full datetime (`2026-07-17T00:00:00.000Z`) — as a local-midnight Date.
 * Using the string's own y-m-d avoids UTC/local day-shift for expiry semantics.
 */
function localDateFromIso(iso: string): Date {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return midnight(new Date(iso));
}

export function daysLeft(iso: string | null | undefined, today: Date = new Date()): number | null {
  if (!iso) return null;
  const d = localDateFromIso(iso);
  const t = midnight(today);
  return Math.round((d.getTime() - t.getTime()) / 86_400_000);
}

export function expiryText(dl: number | null): string {
  if (dl === null) return 'no expiry';
  if (dl < 0) {
    const n = Math.abs(dl);
    return `expired ${n} ${n === 1 ? 'day' : 'days'} ago`;
  }
  if (dl === 0) return 'expires today';
  if (dl === 1) return 'expires tomorrow';
  if (dl <= 14) return `expires in ${dl} days`;
  return 'fresh for weeks';
}

export type ExpiryStatus = 'expired' | 'soon' | 'fresh';

export function expiryStatus(dl: number | null): ExpiryStatus {
  if (dl !== null && dl < 0) return 'expired';
  if (dl !== null && dl >= 0 && dl <= 2) return 'soon';
  return 'fresh';
}

/** Urgent = expiring within two days (drives the use-soon strip + Kitchen tab badge). */
export function isUrgent(dl: number | null): boolean {
  return dl !== null && dl >= 0 && dl <= 2;
}

/** Short relative label for the use-soon strip pill. */
export function urgentLabel(dl: number | null): string {
  if (dl === 0) return 'today';
  if (dl === 1) return 'tomorrow';
  return `${dl} days`;
}

export function stepFor(unit: string): number {
  if (unit === 'g' || unit === 'ml') return 50;
  if (unit === 'kg' || unit === 'L') return 0.5;
  return 1;
}

/** Apply a stepper delta and round to 2 dp (never below 0). */
export function applyStep(quantity: number, delta: number): number {
  return Math.max(0, Math.round((quantity + delta) * 100) / 100);
}
