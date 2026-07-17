import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QuickAddProvider, useQuickAdd } from '../../src/context/QuickAddContext';
import { parseQuickAll } from '../../src/lib/quick-parse';

vi.mock('../../src/services/quick-add', () => ({
  getAliases: vi.fn().mockResolvedValue([]),
  putAlias: vi.fn().mockResolvedValue(undefined),
  assistParse: vi.fn(),
}));

import { assistParse } from '../../src/services/quick-add';

const mockAssist = vi.mocked(assistParse);

const TODAY = new Date(2026, 6, 12);

function parse(text: string): ReturnType<typeof parseQuickAll> {
  return parseQuickAll(text, TODAY);
}

function wrapper({ children }: { children: React.ReactNode }): React.JSX.Element {
  return <QuickAddProvider>{children}</QuickAddProvider>;
}

describe('AI-assist trigger (spec 005 US4, FR-IQ-019..021, research D7)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('consults assistance for a low-confidence item after the debounce', async () => {
    mockAssist.mockResolvedValue({ category: 'Condiments', location: 'fridge', shelfLifeDays: 90 });
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    const [item] = result.current.enhance(parse('gochujang'), TODAY);
    expect(item!.category).toBe('Other');

    act(() => result.current.requestAssist(item!));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mockAssist).toHaveBeenCalledTimes(1);
    expect(mockAssist).toHaveBeenCalledWith('Gochujang');

    const [assisted] = result.current.enhance(parse('gochujang'), TODAY);
    expect(assisted).toMatchObject({
      category: 'Condiments',
      location: 'fridge',
      provenance: { category: 'assisted', location: 'assisted' },
    });
    expect(assisted!.suggestedExpiresAt).toBeDefined();
  });

  it('never consults assistance for a confidently categorised item', async () => {
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    const [item] = result.current.enhance(parse('spinach'), TODAY);
    act(() => result.current.requestAssist(item!));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(mockAssist).not.toHaveBeenCalled();
  });

  it('debounces rapid requests — only the latest fires (one in-flight)', async () => {
    mockAssist.mockResolvedValue(null);
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    const [first] = result.current.enhance(parse('gochu'), TODAY);
    const [second] = result.current.enhance(parse('gochujang paste'), TODAY);
    act(() => result.current.requestAssist(first!));
    act(() => result.current.requestAssist(second!));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mockAssist).toHaveBeenCalledTimes(1);
    expect(mockAssist).toHaveBeenCalledWith('Gochujang Paste');
  });

  it('does not repeat a consultation for the same name (FR-IQ-022)', async () => {
    mockAssist.mockResolvedValue(null);
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    const [item] = result.current.enhance(parse('gochujang'), TODAY);
    act(() => result.current.requestAssist(item!));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    act(() => result.current.requestAssist(item!));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    expect(mockAssist).toHaveBeenCalledTimes(1);
  });

  it('fails open silently when assistance is unavailable (FR-IQ-021)', async () => {
    mockAssist.mockRejectedValue(new Error('503'));
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    const [item] = result.current.enhance(parse('gochujang'), TODAY);
    act(() => result.current.requestAssist(item!));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    // Deterministic result stands; no throw, no change.
    const [after] = result.current.enhance(parse('gochujang'), TODAY);
    expect(after).toMatchObject({ category: 'Other', provenance: { category: 'guess' } });
  });

  it('never overrides explicit text with an assisted value (FR-IQ-016/020)', async () => {
    mockAssist.mockResolvedValue({ category: 'Condiments', location: 'pantry' });
    const { result } = renderHook(() => useQuickAdd(), { wrapper });
    const [item] = result.current.enhance(parse('gochujang in the fridge'), TODAY);
    act(() => result.current.requestAssist(item!));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });
    const [after] = result.current.enhance(parse('gochujang in the fridge'), TODAY);
    expect(after).toMatchObject({
      category: 'Condiments',
      location: 'fridge',
      provenance: { category: 'assisted', location: 'explicit' },
    });
  });
});
