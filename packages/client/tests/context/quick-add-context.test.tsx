import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QuickAddProvider, useQuickAdd } from '../../src/context/QuickAddContext';
import { parseQuickAll } from '../../src/lib/quick-parse';

vi.mock('../../src/services/quick-add', () => ({
  getAliases: vi.fn(),
  putAlias: vi.fn().mockResolvedValue(undefined),
}));

import { getAliases, putAlias } from '../../src/services/quick-add';

const mockGet = vi.mocked(getAliases);
const mockPut = vi.mocked(putAlias);

const TODAY = new Date(2026, 6, 12);

function parse(text: string): ReturnType<typeof parseQuickAll> {
  return parseQuickAll(text, TODAY);
}

function wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <QuickAddProvider>{children}</QuickAddProvider>;
}

async function ready(): Promise<ReturnType<typeof renderHook<ReturnType<typeof useQuickAdd>, unknown>>> {
  const hook = renderHook(() => useQuickAdd(), { wrapper });
  // Aliases load lazily on the first enhance() call.
  hook.result.current.enhance(parse('anything'), TODAY);
  await waitFor(() => expect(hook.result.current.ready).toBe(true));
  return hook;
}

describe('QuickAddContext (spec 005 US3, FR-IQ-015..018)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue([
      { nameKey: 'tortillas', category: 'Grains', location: 'pantry', unit: 'pack' },
      { nameKey: 'salad mix', suggestedShelfLifeDays: 5 },
    ]);
  });

  it('loads aliases once and merges them as learned provenance', async () => {
    const hook = await ready();
    const [item] = hook.result.current.enhance(parse('tortillas'), TODAY);
    expect(item).toMatchObject({
      category: 'Grains',
      location: 'pantry',
      unit: 'pack',
      provenance: { category: 'learned', location: 'learned', unit: 'learned' },
    });
    expect(mockGet).toHaveBeenCalledTimes(1);
  });

  it('never overrides explicit text with a learned value (FR-IQ-016)', async () => {
    const hook = await ready();
    const [item] = hook.result.current.enhance(parse('tortillas in the freezer'), TODAY);
    expect(item).toMatchObject({ location: 'freezer', provenance: { location: 'explicit' } });
  });

  it('offers a shelf-life suggestion without applying it (FR-IQ-017)', async () => {
    const hook = await ready();
    const [item] = hook.result.current.enhance(parse('salad mix'), TODAY);
    expect(item!.expiresAt).toBeNull();
    expect(item!.suggestedExpiresAt).toBe('2026-07-17'); // TODAY + 5 days
  });

  it('records a learnable chip correction via PUT', async () => {
    const hook = await ready();
    const [item] = hook.result.current.enhance(parse('spinach'), TODAY);
    hook.result.current.recordCorrection(item!, 'location', 'pantry');
    expect(mockPut).toHaveBeenCalledWith('spinach', { location: 'pantry' });
  });

  it('does not learn from quantity/expiry corrections (not alias fields)', async () => {
    const hook = await ready();
    const [item] = hook.result.current.enhance(parse('spinach'), TODAY);
    hook.result.current.recordCorrection(item!, 'quantity', 3);
    hook.result.current.recordCorrection(item!, 'expiresAt', '2026-07-20');
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('records an observation for an explicitly typed expiry on add', async () => {
    const hook = await ready();
    const [item] = hook.result.current.enhance(parse('salad mix exp 4d'), TODAY);
    hook.result.current.recordAdd(item!, TODAY);
    expect(mockPut).toHaveBeenCalledWith('salad mix', { observedShelfLifeDays: 4 });
  });

  it('does NOT record suggestion-accepted expiries as observations (analyze U2)', async () => {
    const hook = await ready();
    const [item] = hook.result.current.enhance(parse('salad mix'), TODAY);
    // Simulate the one-tap accept: expiry set from the suggestion, provenance learned.
    const accepted = {
      ...item!,
      expiresAt: item!.suggestedExpiresAt!,
      provenance: { ...item!.provenance, expiresAt: 'learned' as const },
    };
    hook.result.current.recordAdd(accepted, TODAY);
    expect(mockPut).not.toHaveBeenCalled();
  });

  it('works as a no-op without a provider (tests, vite parity)', () => {
    const { result } = renderHook(() => useQuickAdd());
    const items = parse('tortillas');
    expect(result.current.enhance(items, TODAY)).toEqual(items);
    expect(() => result.current.recordCorrection(items[0]!, 'location', 'pantry')).not.toThrow();
  });
});
