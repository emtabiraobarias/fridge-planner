import { describe, it, expect } from 'vitest';
import {
  parseQuick,
  parseQuickAll,
  daysLeft,
  expiryText,
  expiryStatus,
  isUrgent,
  urgentLabel,
  stepFor,
  applyStep,
} from '../../src/lib/quick-parse';

// Pinned "today" = Sunday 2026-07-12 (see design/reference-logic.md worked examples).
const TODAY = new Date(2026, 6, 12);

describe('parseQuick', () => {
  it('parses quantity + unit + weekday expiry ("2L milk expires friday")', () => {
    expect(parseQuick('2L milk expires friday', TODAY)).toMatchObject({
      name: 'Milk',
      quantity: 2,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
      expiresAt: '2026-07-17',
    });
  });

  it('parses grams with no expiry ("500g mince")', () => {
    expect(parseQuick('500g mince', TODAY)).toMatchObject({
      name: 'Mince',
      quantity: 500,
      unit: 'g',
      category: 'Meat',
      location: 'fridge',
      expiresAt: null,
    });
  });

  it('parses a bare count ("6 eggs")', () => {
    expect(parseQuick('6 eggs', TODAY)).toMatchObject({
      name: 'Eggs',
      quantity: 6,
      unit: 'count',
      category: 'Dairy',
    });
  });

  it('parses a relative offset ("spinach exp 3d")', () => {
    expect(parseQuick('spinach exp 3d', TODAY)).toMatchObject({
      name: 'Spinach',
      category: 'Produce',
      expiresAt: '2026-07-15',
    });
  });

  it('parses a dd/mm expiry ("chicken thighs expires 16/7")', () => {
    expect(parseQuick('chicken thighs expires 16/7', TODAY)).toMatchObject({
      name: 'Chicken Thighs',
      category: 'Meat',
      expiresAt: '2026-07-16',
    });
  });

  it('parses kg into pantry grains ("2 kg jasmine rice")', () => {
    expect(parseQuick('2 kg jasmine rice', TODAY)).toMatchObject({
      name: 'Jasmine Rice',
      quantity: 2,
      unit: 'kg',
      category: 'Grains',
      location: 'pantry',
    });
  });

  it('defaults unknown items to Other/fridge/count', () => {
    expect(parseQuick('olive oil', TODAY)).toMatchObject({
      name: 'Olive Oil',
      quantity: 1,
      unit: 'count',
      category: 'Condiments',
      location: 'pantry',
    });
    expect(parseQuick('mystery thing', TODAY)).toMatchObject({
      category: 'Other',
      location: 'fridge',
    });
  });

  it('returns null for empty input or a bare number with no name', () => {
    expect(parseQuick('', TODAY)).toBeNull();
    expect(parseQuick('   ', TODAY)).toBeNull();
    expect(parseQuick('12', TODAY)).toBeNull();
  });

  it('resolves a weekday that is today to the next occurrence (never today)', () => {
    // TODAY is Sunday → "expires sunday" resolves 7 days out.
    expect(parseQuick('milk expires sunday', TODAY)).toMatchObject({ expiresAt: '2026-07-19' });
  });
});

// ── Spec 005 — intelligent understanding (FR-IQ-001..006) ──

describe('explicit locations (FR-IQ-001)', () => {
  it('strips "in the <location>" and sets the location explicitly', () => {
    expect(parseQuick('chicken thighs in the freezer', TODAY)).toMatchObject({
      name: 'Chicken Thighs',
      category: 'Meat',
      location: 'freezer',
      provenance: { location: 'explicit' },
    });
  });

  it('explicit location overrides the category-derived default', () => {
    expect(parseQuick('bread in the freezer', TODAY)).toMatchObject({
      name: 'Bread',
      category: 'Grains',
      location: 'freezer',
    });
  });

  it('understands "in <location>" and "to the <location>"', () => {
    expect(parseQuick('milk in pantry', TODAY)).toMatchObject({ name: 'Milk', location: 'pantry' });
    expect(parseQuick('yogurt to the freezer', TODAY)).toMatchObject({
      name: 'Yogurt',
      location: 'freezer',
    });
  });

  it('understands a bare location word at the end of the segment', () => {
    expect(parseQuick('chicken freezer', TODAY)).toMatchObject({
      name: 'Chicken',
      location: 'freezer',
      provenance: { location: 'explicit' },
    });
  });

  it('never strips category keywords like "frozen" from the name', () => {
    expect(parseQuick('frozen peas', TODAY)).toMatchObject({
      name: 'Frozen Peas',
      category: 'Frozen',
      location: 'freezer',
      provenance: { location: 'guess' },
    });
  });
});

describe('unit synonyms (FR-IQ-002)', () => {
  it.each([
    ['500 grams mince', 'Mince', 500, 'g'],
    ['2 kilos chicken', 'Chicken', 2, 'kg'],
    ['1 litre milk', 'Milk', 1, 'L'],
    ['250 millilitres cream', 'Cream', 250, 'ml'],
    ['2 packets pasta', 'Pasta', 2, 'pack'],
    ['3 tins tuna', 'Tuna', 3, 'can'],
    ['2 bottles soy sauce', 'Soy Sauce', 2, 'bottle'],
    ['1 can crushed tomatoes', 'Crushed Tomatoes', 1, 'can'],
    ['4 pieces chicken', 'Chicken', 4, 'pcs'],
  ])('normalises "%s" → %s %s %s', (input, name, quantity, unit) => {
    expect(parseQuick(input, TODAY)).toMatchObject({ name, quantity, unit });
  });

  it('never treats a non-unit word as a unit ("a can of beans", "tomatoes 2 large")', () => {
    expect(parseQuick('a can of beans', TODAY)).toMatchObject({
      name: 'A Can Of Beans',
      quantity: 1,
      unit: 'count',
    });
    expect(parseQuick('tomatoes 2 large', TODAY)).toMatchObject({
      name: 'Tomatoes 2 Large',
      quantity: 1,
    });
  });
});

describe('expiry vocabulary (FR-IQ-003/004)', () => {
  it.each([
    ['yogurt use by tomorrow', 'Yogurt', '2026-07-13'],
    ['ham best before friday', 'Ham', '2026-07-17'],
    ['cheese expires today', 'Cheese', '2026-07-12'],
    ['salmon use-by 3d', 'Salmon', '2026-07-15'],
    ['chicken exp 16 july', 'Chicken', '2026-07-16'],
    ['chicken expires jul 16', 'Chicken', '2026-07-16'],
    ['beef expires 5 march', 'Beef', '2027-03-05'], // month-name rollover
  ])('parses "%s" → %s expiring %s', (input, name, expiresAt) => {
    expect(parseQuick(input, TODAY)).toMatchObject({
      name,
      expiresAt,
      provenance: { expiresAt: 'explicit' },
    });
  });

  it('rolls a past dd/mm into next year, keeps today and future in this year', () => {
    expect(parseQuick('ham expires 2/1', TODAY)).toMatchObject({ expiresAt: '2027-01-02' });
    expect(parseQuick('ham expires 12/7', TODAY)).toMatchObject({ expiresAt: '2026-07-12' });
    expect(parseQuick('chicken expires 16/7', TODAY)).toMatchObject({ expiresAt: '2026-07-16' });
  });

  it('leaves expiry unset on an unresolvable token without corrupting the name', () => {
    expect(parseQuick('cheese expires someday', TODAY)).toMatchObject({
      name: 'Cheese Expires Someday',
      expiresAt: null,
      provenance: { expiresAt: 'guess' },
    });
  });
});

describe('trailing quantity (FR-IQ-005)', () => {
  it('extracts a trailing quantity + unit ("milk 2L")', () => {
    expect(parseQuick('milk 2L', TODAY)).toMatchObject({
      name: 'Milk',
      quantity: 2,
      unit: 'L',
      provenance: { quantity: 'explicit', unit: 'explicit' },
    });
  });

  it('extracts x-notation counts ("eggs x6", "6x eggs")', () => {
    expect(parseQuick('eggs x6', TODAY)).toMatchObject({ name: 'Eggs', quantity: 6, unit: 'count' });
    expect(parseQuick('6x eggs', TODAY)).toMatchObject({ name: 'Eggs', quantity: 6, unit: 'count' });
  });

  it('leading quantity wins over trailing', () => {
    expect(parseQuick('2L milk 3', TODAY)).toMatchObject({ quantity: 2, unit: 'L' });
  });
});

describe('multi-item input (FR-IQ-006)', () => {
  it('parses comma-separated items independently', () => {
    const items = parseQuickAll('milk 2L, 6 eggs, sourdough', TODAY);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ name: 'Milk', quantity: 2, unit: 'L' });
    expect(items[1]).toMatchObject({ name: 'Eggs', quantity: 6, category: 'Dairy' });
    expect(items[2]).toMatchObject({ name: 'Sourdough', category: 'Other' }); // long-tail name — CAT_GUESS unchanged; US3/US4 cover it
  });

  it('each segment carries only its own details', () => {
    const items = parseQuickAll('2L milk expires friday, 500g mince, bread in the freezer', TODAY);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ name: 'Milk', expiresAt: '2026-07-17', location: 'fridge' });
    expect(items[1]).toMatchObject({ name: 'Mince', quantity: 500, unit: 'g', expiresAt: null });
    expect(items[2]).toMatchObject({ name: 'Bread', location: 'freezer', expiresAt: null });
  });

  it('skips empty and bare-number segments without failing the input', () => {
    expect(parseQuickAll('milk,, 12,', TODAY)).toHaveLength(1);
    expect(parseQuickAll('', TODAY)).toHaveLength(0);
    expect(parseQuickAll('  ,  ', TODAY)).toHaveLength(0);
  });
});

describe('per-field provenance (FR-IQ-011 groundwork)', () => {
  it('marks everything a bare name did not state as a guess', () => {
    expect(parseQuick('spinach', TODAY)).toMatchObject({
      provenance: {
        quantity: 'guess',
        unit: 'guess',
        category: 'guess',
        location: 'guess',
        expiresAt: 'guess',
      },
    });
  });

  it('marks parsed fields explicit, inferred ones guess ("6 eggs")', () => {
    expect(parseQuick('6 eggs', TODAY)).toMatchObject({
      provenance: { quantity: 'explicit', unit: 'guess', category: 'guess' },
    });
  });

  it('marks a fully specified phrase explicit except category', () => {
    expect(parseQuick('2L milk use by friday in the freezer', TODAY)).toMatchObject({
      name: 'Milk',
      location: 'freezer',
      expiresAt: '2026-07-17',
      provenance: {
        quantity: 'explicit',
        unit: 'explicit',
        location: 'explicit',
        expiresAt: 'explicit',
        category: 'guess',
      },
    });
  });
});

describe('daysLeft / expiryText / expiryStatus', () => {
  it('computes days remaining', () => {
    expect(daysLeft('2026-07-12', TODAY)).toBe(0);
    expect(daysLeft('2026-07-13', TODAY)).toBe(1);
    expect(daysLeft('2026-07-10', TODAY)).toBe(-2);
    expect(daysLeft(null, TODAY)).toBeNull();
    expect(daysLeft(undefined, TODAY)).toBeNull();
  });

  it('labels expiry in plain language', () => {
    expect(expiryText(null)).toBe('no expiry');
    expect(expiryText(-2)).toBe('expired 2 days ago');
    expect(expiryText(-1)).toBe('expired 1 day ago');
    expect(expiryText(0)).toBe('expires today');
    expect(expiryText(1)).toBe('expires tomorrow');
    expect(expiryText(3)).toBe('expires in 3 days');
    expect(expiryText(30)).toBe('fresh for weeks');
  });

  it('buckets urgency', () => {
    expect(expiryStatus(-1)).toBe('expired');
    expect(expiryStatus(2)).toBe('soon');
    expect(expiryStatus(5)).toBe('fresh');
    expect(expiryStatus(null)).toBe('fresh');
    expect(isUrgent(0)).toBe(true);
    expect(isUrgent(2)).toBe(true);
    expect(isUrgent(3)).toBe(false);
    expect(isUrgent(null)).toBe(false);
    expect(urgentLabel(0)).toBe('today');
    expect(urgentLabel(1)).toBe('tomorrow');
    expect(urgentLabel(2)).toBe('2 days');
  });
});

describe('stepFor / applyStep', () => {
  it('sizes steps by unit', () => {
    expect(stepFor('g')).toBe(50);
    expect(stepFor('ml')).toBe(50);
    expect(stepFor('kg')).toBe(0.5);
    expect(stepFor('L')).toBe(0.5);
    expect(stepFor('count')).toBe(1);
    expect(stepFor('bag')).toBe(1);
  });

  it('applies steps, rounding to 2dp and flooring at 0', () => {
    expect(applyStep(2, 0.5)).toBe(2.5);
    expect(applyStep(500, 50)).toBe(550);
    expect(applyStep(0.5, -0.5)).toBe(0);
    expect(applyStep(1, -1)).toBe(0);
    expect(applyStep(0, -1)).toBe(0);
  });
});
