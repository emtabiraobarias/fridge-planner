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
    expect(screen.getByText('2 L')).toBeInTheDocument();
    expect(screen.getByText('Dairy · fridge')).toBeInTheDocument();
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
});
