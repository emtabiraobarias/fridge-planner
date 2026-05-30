import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { GroceryListSearchBar } from '../../../src/components/grocery/GroceryListSearchBar';

describe('GroceryListSearchBar', () => {
  it('renders input with provided value', () => {
    render(<GroceryListSearchBar value="eggs" onChange={vi.fn()} />);
    expect(screen.getByRole('searchbox', { name: /search grocery items/i })).toHaveValue('eggs');
  });

  it('calls onChange with new value when user types', () => {
    const onChange = vi.fn();
    render(<GroceryListSearchBar value="" onChange={onChange} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'milk' } });
    expect(onChange).toHaveBeenCalledWith('milk');
  });
});
