import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { AddGroceryItemForm } from '../../../src/components/grocery/AddGroceryItemForm';

describe('AddGroceryItemForm', () => {
  it('renders the form heading and submit button', () => {
    render(<AddGroceryItemForm onAdd={vi.fn()} />);
    expect(screen.getByText(/add item manually/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add item/i })).toBeInTheDocument();
  });

  it('shows error when submitted with empty name', () => {
    render(<AddGroceryItemForm onAdd={vi.fn()} />);
    fireEvent.submit(screen.getByRole('button', { name: /add item/i }).closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent(/item name is required/i);
  });

  it('shows error when quantity is invalid', () => {
    render(<AddGroceryItemForm onAdd={vi.fn()} />);
    fireEvent.change(screen.getByPlaceholderText(/olive oil/i), { target: { value: 'Eggs' } });
    fireEvent.change(screen.getByDisplayValue('1'), { target: { value: '-5' } });
    fireEvent.submit(screen.getByRole('button', { name: /add item/i }).closest('form')!);
    expect(screen.getByRole('alert')).toHaveTextContent(/non-negative/i);
  });

  it('calls onAdd with form data and resets on successful submit', () => {
    const onAdd = vi.fn();
    render(<AddGroceryItemForm onAdd={onAdd} />);
    fireEvent.change(screen.getByPlaceholderText(/olive oil/i), { target: { value: 'Butter' } });
    fireEvent.submit(screen.getByRole('button', { name: /add item/i }).closest('form')!);
    expect(onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ displayName: 'Butter', quantity: 1 }),
    );
    expect(screen.getByPlaceholderText(/olive oil/i)).toHaveValue('');
  });
});
