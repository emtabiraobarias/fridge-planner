import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { QuickAdd } from '../../../src/components/inventory/QuickAdd';

describe('QuickAdd', () => {
  it('shows a live parse preview as the user types', async () => {
    render(<QuickAdd onAdd={() => {}} />);
    await userEvent.type(screen.getByLabelText(/quick add item/i), '2L milk');
    expect(screen.getByText("I'll add:")).toBeInTheDocument();
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /quantity: 2 L/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /category: Dairy/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /location: fridge/i })).toBeInTheDocument();
  });

  it('submits the parsed item on Enter and clears the input', async () => {
    const onAdd = vi.fn();
    render(<QuickAdd onAdd={onAdd} />);
    const input = screen.getByLabelText(/quick add item/i) as HTMLInputElement;
    await userEvent.type(input, '6 eggs{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ name: 'Eggs', quantity: 6, unit: 'count', category: 'Dairy' });
    expect(input.value).toBe('');
  });

  it('submits via the Add button', async () => {
    const onAdd = vi.fn();
    render(<QuickAdd onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText(/quick add item/i), 'olive oil');
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
  });

  it('is a no-op for empty or name-less input', async () => {
    const onAdd = vi.fn();
    render(<QuickAdd onAdd={onAdd} />);
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    await userEvent.type(screen.getByLabelText(/quick add item/i), '12{Enter}');
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('fills the input from a staple chip', async () => {
    render(<QuickAdd onAdd={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '+ Eggs' }));
    expect((screen.getByLabelText(/quick add item/i) as HTMLInputElement).value).toBe('eggs');
  });

  // ── spec 005 US1 — multi-item + extended grammar (FR-IQ-001/002/006) ──

  it('previews and submits every comma-separated item (FR-IQ-006)', async () => {
    const onAdd = vi.fn();
    render(<QuickAdd onAdd={onAdd} />);
    const input = screen.getByLabelText(/quick add item/i) as HTMLInputElement;
    await userEvent.type(input, 'milk 2L, 6 eggs');
    expect(screen.getByText('Milk')).toBeInTheDocument();
    expect(screen.getByText('Eggs')).toBeInTheDocument();
    await userEvent.keyboard('{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(2);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ name: 'Milk', quantity: 2, unit: 'L' });
    expect(onAdd.mock.calls[1]![0]).toMatchObject({ name: 'Eggs', quantity: 6 });
    expect(input.value).toBe('');
  });

  it('skips unusable segments but adds the rest', async () => {
    const onAdd = vi.fn();
    render(<QuickAdd onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText(/quick add item/i), 'milk,, 12,{Enter}');
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ name: 'Milk' });
  });

  it('parses spelled-out units and explicit locations (FR-IQ-001/002)', async () => {
    const onAdd = vi.fn();
    render(<QuickAdd onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText(/quick add item/i), '500 grams mince in the freezer{Enter}');
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      name: 'Mince',
      quantity: 500,
      unit: 'g',
      location: 'freezer',
    });
  });

  // ── spec 005 US2 — tap-to-correct preview (FR-IQ-012/014) ──

  it('submits the corrected value after a chip correction', async () => {
    const onAdd = vi.fn();
    render(<QuickAdd onAdd={onAdd} />);
    await userEvent.type(screen.getByLabelText(/quick add item/i), 'spinach');
    await userEvent.click(screen.getByRole('button', { name: /location: fridge \(guessed\)/i }));
    await userEvent.click(screen.getByRole('option', { name: 'pantry' }));
    await userEvent.click(screen.getByRole('button', { name: /^add$/i }));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd.mock.calls[0]![0]).toMatchObject({
      name: 'Spinach',
      location: 'pantry',
      provenance: { location: 'explicit' },
    });
  });

  it('keeps a correction while further typing does not contradict it (FR-IQ-014)', async () => {
    const onAdd = vi.fn();
    render(<QuickAdd onAdd={onAdd} />);
    const input = screen.getByLabelText(/quick add item/i);
    await userEvent.type(input, 'spinach');
    await userEvent.click(screen.getByRole('button', { name: /location: fridge/i }));
    await userEvent.click(screen.getByRole('option', { name: 'pantry' }));
    await userEvent.type(input, ' exp 3d{Enter}');
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ location: 'pantry', name: 'Spinach' });
  });

  it('drops a correction when new text states that field explicitly', async () => {
    const onAdd = vi.fn();
    render(<QuickAdd onAdd={onAdd} />);
    const input = screen.getByLabelText(/quick add item/i);
    await userEvent.type(input, 'spinach');
    await userEvent.click(screen.getByRole('button', { name: /location: fridge/i }));
    await userEvent.click(screen.getByRole('option', { name: 'pantry' }));
    await userEvent.type(input, ' in the freezer{Enter}');
    expect(onAdd.mock.calls[0]![0]).toMatchObject({ location: 'freezer' });
  });
});
