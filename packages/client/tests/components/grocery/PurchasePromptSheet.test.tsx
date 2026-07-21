import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { PurchasePromptSheet } from '../../../src/components/grocery/PurchasePromptSheet';

describe('PurchasePromptSheet (spec 007 FR-GC-009/010)', () => {
  it('renders prefilled controls and confirms the resolved purchase payload', () => {
    const onConfirm = vi.fn();
    render(
      <PurchasePromptSheet
        itemName="Tortillas"
        quantity={2}
        unit="count"
        location="pantry"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.change(screen.getByLabelText(/quantity/i), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText(/unit/i), { target: { value: 'pack' } });
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      quantity: 3,
      unit: 'pack',
      location: 'pantry',
    });
  });

  it('offers an expiry suggestion but applies it only when tapped', () => {
    const onConfirm = vi.fn();
    render(
      <PurchasePromptSheet
        itemName="Tortillas"
        quantity={2}
        unit="count"
        location="pantry"
        suggestedExpiresAt="2026-07-25"
        onCancel={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenLastCalledWith({
      quantity: 2,
      unit: 'count',
      location: 'pantry',
    });

    fireEvent.click(screen.getByRole('button', { name: /use expiry suggestion/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }));
    expect(onConfirm).toHaveBeenLastCalledWith({
      quantity: 2,
      unit: 'count',
      location: 'pantry',
      expiresAt: '2026-07-25T00:00:00.000Z',
    });
  });

  it('cancels without confirming', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(
      <PurchasePromptSheet
        itemName="Tortillas"
        quantity={2}
        unit="count"
        location="pantry"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
