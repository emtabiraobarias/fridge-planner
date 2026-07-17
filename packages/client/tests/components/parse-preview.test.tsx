import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { ParsePreview } from '../../src/components/shared/ParsePreview';
import { parseQuickAll } from '../../src/lib/quick-parse';

const TODAY = new Date(2026, 6, 12);

function parse(text: string): ReturnType<typeof parseQuickAll> {
  return parseQuickAll(text, TODAY);
}

describe('ParsePreview (spec 005 US2, FR-IQ-010..013)', () => {
  it('marks guessed fields tentative and parsed fields confident', () => {
    render(<ParsePreview items={parse('spinach')} onCorrect={() => {}} />);
    expect(screen.getByRole('button', { name: /category: Produce \(guessed\)/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /location: fridge \(guessed\)/i })).toBeInTheDocument();
  });

  it('does not mark explicitly parsed values as guessed', () => {
    render(<ParsePreview items={parse('2L milk in the freezer')} onCorrect={() => {}} />);
    expect(screen.getByRole('button', { name: /quantity: 2 L$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /location: freezer$/i })).toBeInTheDocument();
  });

  it('corrects a field via the chip picker (FR-IQ-012)', async () => {
    const onCorrect = vi.fn();
    const items = parse('spinach');
    render(<ParsePreview items={items} onCorrect={onCorrect} />);
    await userEvent.click(screen.getByRole('button', { name: /location: fridge/i }));
    await userEvent.click(screen.getByRole('option', { name: 'pantry' }));
    expect(onCorrect).toHaveBeenCalledWith(items[0], 'location', 'pantry');
  });

  it('corrects quantity via a number input', async () => {
    const onCorrect = vi.fn();
    const items = parse('6 eggs');
    render(<ParsePreview items={items} onCorrect={onCorrect} />);
    await userEvent.click(screen.getByRole('button', { name: /quantity: 6 count/i }));
    const input = screen.getByLabelText(/correct quantity/i);
    await userEvent.clear(input);
    await userEvent.type(input, '12');
    await userEvent.click(screen.getByRole('button', { name: /^set$/i }));
    expect(onCorrect).toHaveBeenCalledWith(items[0], 'quantity', 12);
  });

  it('offers an expiry chip even when no expiry was parsed', async () => {
    const onCorrect = vi.fn();
    const items = parse('spinach');
    render(<ParsePreview items={items} onCorrect={onCorrect} />);
    await userEvent.click(screen.getByRole('button', { name: /expiry: no expiry/i }));
    const input = screen.getByLabelText(/correct expiry/i);
    await userEvent.type(input, '2026-07-20');
    await userEvent.click(screen.getByRole('button', { name: /^set$/i }));
    expect(onCorrect).toHaveBeenCalledWith(items[0], 'expiresAt', '2026-07-20');
  });

  it('renders one correctable row per item (FR-IQ-013)', () => {
    render(<ParsePreview items={parse('milk 2L, 6 eggs')} onCorrect={() => {}} />);
    expect(screen.getByRole('group', { name: /parsed item Milk/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /parsed item Eggs/i })).toBeInTheDocument();
  });

  it('hides location/expiry chips when the entry point does not use them', () => {
    render(
      <ParsePreview items={parse('spinach')} onCorrect={() => {}} showLocation={false} showExpiry={false} />,
    );
    expect(screen.queryByRole('button', { name: /location/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /expiry/i })).not.toBeInTheDocument();
  });
});
