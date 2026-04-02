import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DietaryPreferences } from '../../src/components/recommendations/DietaryPreferences';

describe('DietaryPreferences', () => {
  it('renders all preference checkboxes', () => {
    render(<DietaryPreferences selected={[]} onChange={vi.fn()} />);
    expect(screen.getByLabelText('vegetarian')).toBeInTheDocument();
    expect(screen.getByLabelText('vegan')).toBeInTheDocument();
    expect(screen.getByLabelText('gluten-free')).toBeInTheDocument();
  });

  it('checks selected preferences', () => {
    render(<DietaryPreferences selected={['vegan']} onChange={vi.fn()} />);
    expect(screen.getByLabelText('vegan')).toBeChecked();
    expect(screen.getByLabelText('vegetarian')).not.toBeChecked();
  });

  it('calls onChange when toggling', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DietaryPreferences selected={[]} onChange={onChange} />);
    await user.click(screen.getByLabelText('gluten-free'));
    expect(onChange).toHaveBeenCalledWith(['gluten-free']);
  });

  it('removes preference on uncheck', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DietaryPreferences selected={['vegan', 'nut-free']} onChange={onChange} />);
    await user.click(screen.getByLabelText('vegan'));
    expect(onChange).toHaveBeenCalledWith(['nut-free']);
  });
});
