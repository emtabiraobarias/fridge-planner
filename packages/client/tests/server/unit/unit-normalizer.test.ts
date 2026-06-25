import { describe, it, expect } from 'vitest';
import {
  normalizeUnit,
  canSubtract,
  netNeeded,
  resolveAlias,
} from '@server/lib/unit-normalizer';

describe('resolveAlias', () => {
  it('resolves known aliases', () => {
    expect(resolveAlias('Cups')).toBe('cup');
    expect(resolveAlias('tablespoon')).toBe('tbsp');
    expect(resolveAlias('pounds')).toBe('lb');
    expect(resolveAlias('grams')).toBe('g');
    expect(resolveAlias('piece')).toBe('count');
  });

  it('lowercases and trims unknown units', () => {
    expect(resolveAlias('  Sprigs  ')).toBe('sprigs');
  });

  it('returns the value unchanged if no alias', () => {
    expect(resolveAlias('ml')).toBe('ml');
    expect(resolveAlias('kg')).toBe('kg');
  });
});

describe('normalizeUnit', () => {
  describe('volume family', () => {
    it('normalises ml to ml (factor 1)', () => {
      const result = normalizeUnit(500, 'ml');
      expect(result.value).toBeCloseTo(500);
      expect(result.baseUnit).toBe('ml');
      expect(result.family).toBe('volume');
    });

    it('normalises cup to ml', () => {
      const result = normalizeUnit(1, 'cup');
      expect(result.value).toBeCloseTo(236.588);
      expect(result.family).toBe('volume');
    });

    it('normalises tablespoon alias (tbsp) to ml', () => {
      const result = normalizeUnit(1, 'tbsp');
      expect(result.value).toBeCloseTo(14.7868);
    });

    it('normalises tablespoon alias (tablespoon) via alias resolution', () => {
      const result = normalizeUnit(2, 'tablespoon');
      expect(result.value).toBeCloseTo(29.5736);
    });

    it('normalises liter to ml', () => {
      const result = normalizeUnit(1, 'l');
      expect(result.value).toBeCloseTo(1000);
    });

    it('normalises fluid ounce', () => {
      const result = normalizeUnit(1, 'fl oz');
      expect(result.value).toBeCloseTo(29.5735);
    });
  });

  describe('mass family', () => {
    it('normalises g to g (factor 1)', () => {
      const result = normalizeUnit(100, 'g');
      expect(result.value).toBeCloseTo(100);
      expect(result.baseUnit).toBe('g');
      expect(result.family).toBe('mass');
    });

    it('normalises kg to g', () => {
      const result = normalizeUnit(1, 'kg');
      expect(result.value).toBeCloseTo(1000);
      expect(result.family).toBe('mass');
    });

    it('normalises oz to g', () => {
      const result = normalizeUnit(1, 'oz');
      expect(result.value).toBeCloseTo(28.3495);
    });

    it('normalises lb to g via alias', () => {
      const result = normalizeUnit(1, 'pound');
      expect(result.value).toBeCloseTo(453.592);
    });
  });

  describe('count family', () => {
    it('normalises count', () => {
      const result = normalizeUnit(3, 'count');
      expect(result.value).toBe(3);
      expect(result.family).toBe('count');
    });

    it('normalises dozen to 12 counts', () => {
      const result = normalizeUnit(1, 'dozen');
      expect(result.value).toBe(12);
      expect(result.family).toBe('count');
    });

    it('normalises piece via alias', () => {
      const result = normalizeUnit(2, 'piece');
      expect(result.value).toBe(2);
      expect(result.family).toBe('count');
    });
  });

  describe('servings family', () => {
    it('returns servings family with value unchanged', () => {
      const result = normalizeUnit(3, 'servings');
      expect(result.value).toBe(3);
      expect(result.family).toBe('servings');
    });
  });

  describe('unknown family', () => {
    it('returns unknown for unrecognised units', () => {
      const result = normalizeUnit(2, 'sprigs');
      expect(result.family).toBe('unknown');
    });
  });
});

describe('canSubtract', () => {
  it('returns true for same family (volume)', () => {
    expect(canSubtract('cup', 'ml')).toBe(true);
  });

  it('returns true for same family (mass)', () => {
    expect(canSubtract('kg', 'oz')).toBe(true);
  });

  it('returns true for same family (count)', () => {
    expect(canSubtract('count', 'dozen')).toBe(true);
  });

  it('returns false for different families (volume vs mass)', () => {
    expect(canSubtract('cup', 'kg')).toBe(false);
  });

  it('returns false when either unit is servings', () => {
    expect(canSubtract('servings', 'ml')).toBe(false);
    expect(canSubtract('cup', 'servings')).toBe(false);
  });

  it('returns false when either unit is unknown', () => {
    expect(canSubtract('sprigs', 'ml')).toBe(false);
    expect(canSubtract('ml', 'sprigs')).toBe(false);
  });
});

describe('netNeeded', () => {
  it('returns null for incompatible units', () => {
    expect(netNeeded(1, 'cup', 100, 'g')).toBeNull();
  });

  it('returns null when one unit is servings', () => {
    expect(netNeeded(3, 'servings', 500, 'ml')).toBeNull();
  });

  it('returns net quantity for count (FR-027: 6 eggs needed, 2 in inventory)', () => {
    const result = netNeeded(6, 'count', 2, 'count');
    expect(result).not.toBeNull();
    expect(result!.netQty).toBe(4);
    expect(result!.netUnit).toBe('count');
  });

  it('returns 0 when available >= needed', () => {
    const result = netNeeded(2, 'count', 5, 'count');
    expect(result!.netQty).toBe(0);
  });

  it('handles cross-unit subtraction in volume', () => {
    // 1 cup = 236.588 ml; available 500 ml > needed, so net = 0
    const result = netNeeded(1, 'cup', 500, 'ml');
    expect(result!.netQty).toBe(0);
  });

  it('handles partial subtraction in volume', () => {
    // Need 2 cups (~473.176 ml), have 200 ml
    const result = netNeeded(2, 'cup', 200, 'ml');
    expect(result).not.toBeNull();
    // net in cups: (473.176 - 200) / 236.588 ≈ 1.154
    expect(result!.netQty).toBeGreaterThan(1);
    expect(result!.netQty).toBeLessThan(1.2);
    expect(result!.netUnit).toBe('cup');
  });

  it('handles mass subtraction', () => {
    const result = netNeeded(1, 'kg', 300, 'g');
    // 1000g - 300g = 700g = 0.7 kg
    expect(result!.netQty).toBeCloseTo(0.7, 1);
    expect(result!.netUnit).toBe('kg');
  });
});
