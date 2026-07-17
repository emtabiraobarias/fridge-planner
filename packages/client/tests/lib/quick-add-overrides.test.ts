import { describe, it, expect } from 'vitest';
import { parseQuickAll } from '../../src/lib/quick-parse';
import { setOverride, applyOverrides, type OverrideMap } from '../../src/lib/quick-add-overrides';

const TODAY = new Date(2026, 6, 12);

function parse(text: string): ReturnType<typeof parseQuickAll> {
  return parseQuickAll(text, TODAY);
}

describe('setOverride / applyOverrides (spec 005 FR-IQ-012/014, research D3)', () => {
  it('records the corrected value and the parsed value it replaced', () => {
    const [spinach] = parse('spinach');
    const map = setOverride({}, spinach!, 'location', 'pantry');
    expect(map['spinach']!.location).toEqual({ value: 'pantry', replaced: 'fridge' });
  });

  it('applies an override and marks the field explicit', () => {
    const items = parse('spinach');
    const map = setOverride({}, items[0]!, 'location', 'pantry');
    const applied = applyOverrides(items, map);
    expect(applied.items[0]).toMatchObject({
      location: 'pantry',
      provenance: { location: 'explicit' },
    });
  });

  it('keeps the override while re-parsing still yields the replaced value', () => {
    const map = setOverride({}, parse('spinach')[0]!, 'location', 'pantry');
    // New text still parses location as the same guess (fridge) → override survives.
    const applied = applyOverrides(parse('spinach exp 3d'), map);
    expect(applied.items[0]).toMatchObject({ location: 'pantry', expiresAt: '2026-07-15' });
    expect(applied.overrides['spinach']!.location).toBeDefined();
  });

  it('drops the override when the fresh parse yields a different value (new text wins)', () => {
    const map = setOverride({}, parse('spinach')[0]!, 'location', 'pantry');
    const applied = applyOverrides(parse('spinach in the freezer'), map);
    expect(applied.items[0]).toMatchObject({
      location: 'freezer',
      provenance: { location: 'explicit' },
    });
    expect(applied.overrides['spinach']?.location).toBeUndefined();
  });

  it('keys overrides by item name across multi-item re-splits', () => {
    const items = parse('milk 2L, bread');
    let map: OverrideMap = setOverride({}, items[1]!, 'location', 'freezer');
    map = setOverride(map, items[0]!, 'category', 'Other');
    // Re-split: bread vanished, eggs appeared, milk kept.
    const applied = applyOverrides(parse('milk 2L, eggs'), map);
    expect(applied.items[0]).toMatchObject({ name: 'Milk', category: 'Other' });
    expect(applied.overrides['bread']).toBeUndefined(); // dropped with its item
    expect(applied.overrides['milk']).toBeDefined();
  });

  it('supports quantity, unit, and expiry corrections', () => {
    const items = parse('6 eggs');
    let map = setOverride({}, items[0]!, 'quantity', 12);
    map = setOverride(map, items[0]!, 'unit', 'dozen');
    map = setOverride(map, items[0]!, 'expiresAt', '2026-07-20');
    const applied = applyOverrides(parse('6 eggs'), map);
    expect(applied.items[0]).toMatchObject({
      quantity: 12,
      unit: 'dozen',
      expiresAt: '2026-07-20',
      provenance: { quantity: 'explicit', unit: 'explicit', expiresAt: 'explicit' },
    });
  });
});
