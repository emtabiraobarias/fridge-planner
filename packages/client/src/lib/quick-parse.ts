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

const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const UNITS = ['kg', 'g', 'l', 'ml', 'count', 'x', 'pcs', 'pack', 'bag', 'can', 'dozen', 'bunch', 'jar', 'loaf'];

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

/** Resolve an `expires <token>` token to a Date, or null if unrecognised. */
function resolveExpiryToken(token: string, base: Date): Date | null {
  const rel = token.match(/^(\d+)\s*(d|w)$/);
  if (rel) {
    const d = new Date(base);
    d.setDate(d.getDate() + Number(rel[1]) * (rel[2] === 'w' ? 7 : 1));
    return d;
  }
  if (/^\d{1,2}\/\d{1,2}$/.test(token)) {
    const [dd, mm] = token.split('/').map(Number) as [number, number];
    return new Date(base.getFullYear(), mm - 1, dd);
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

/** Strip a leading `expires …` clause, returning the remaining text + parsed date. */
function extractExpiry(t: string, base: Date): { text: string; expiresAt: Date | null } {
  const m = t.match(/\b(?:exp(?:ires)?)\s+([a-z0-9/]+)\b/i);
  if (!m) return { text: t, expiresAt: null };
  const expiresAt = resolveExpiryToken(m[1]!.toLowerCase(), base);
  return { text: expiresAt ? t.replace(m[0], '').trim() : t, expiresAt };
}

/** Strip a leading quantity (+ optional unit), returning the remaining text + qty/unit. */
function extractQuantity(t: string): { text: string; quantity: number; unit: string } {
  const m = t.match(/^(\d+(?:\.\d+)?)\s*([a-zA-Z]+)?\s+/);
  if (!m) return { text: t, quantity: 1, unit: 'count' };
  const quantity = Number(m[1]);
  const u = (m[2] ?? '').toLowerCase();
  if (u && UNITS.includes(u)) return { text: t.slice(m[0].length), quantity, unit: u === 'l' ? 'L' : u };
  if (!u) return { text: t.slice(m[0].length), quantity, unit: 'count' };
  // group2 is the item word, not a unit — keep it as part of the name.
  return { text: t.slice(m[1]!.length).trim(), quantity, unit: 'count' };
}

function guessCategoryLocation(name: string): [Category, Location] {
  for (const [re, cat, loc] of CAT_GUESS) {
    if (re.test(name)) return [cat, loc];
  }
  return ['Other', 'fridge'];
}

export function parseQuick(text: string, today: Date = new Date()): ParsedQuick | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const base = midnight(today);
  const afterExpiry = extractExpiry(trimmed, base);
  const afterQty = extractQuantity(afterExpiry.text);

  const name = afterQty.text.replace(/\s+/g, ' ').trim();
  // No usable name (empty, or a bare number like "12" with nothing else) → add nothing.
  if (!name || /^\d+(\.\d+)?$/.test(name)) return null;

  const [category, location] = guessCategoryLocation(name);
  const quantity = afterQty.quantity;
  const unit = afterQty.unit;
  const expiresAt = afterExpiry.expiresAt;

  return {
    name: titleCase(name),
    quantity,
    unit,
    category,
    location,
    expiresAt: expiresAt ? toISODate(expiresAt) : null,
  };
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
