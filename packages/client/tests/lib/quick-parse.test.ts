import { describe, it, expect } from 'vitest';
import {
  parseQuick,
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
    expect(parseQuick('2L milk expires friday', TODAY)).toEqual({
      name: 'Milk',
      quantity: 2,
      unit: 'L',
      category: 'Dairy',
      location: 'fridge',
      expiresAt: '2026-07-17',
    });
  });

  it('parses grams with no expiry ("500g mince")', () => {
    expect(parseQuick('500g mince', TODAY)).toEqual({
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
