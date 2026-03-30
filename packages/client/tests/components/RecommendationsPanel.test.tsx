import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RecommendationsPanel } from '../../src/components/recommendations/RecommendationsPanel';

describe('RecommendationsPanel', () => {
  it('shows a button to fetch recommendations', () => {
    render(<RecommendationsPanel />);
    expect(screen.getByRole('button', { name: /get.*recommendation/i })).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    const slowFetch = vi.fn(() => new Promise<string>(() => {})); // never resolves
    render(<RecommendationsPanel fetchRecommendations={slowFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByText(/loading.*meal|meal.*idea/i)).toBeInTheDocument();
  });

  it('displays recommendation content after successful fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValue('Try Chicken Stir-fry!');
    render(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByText(/chicken stir-fry/i)).toBeInTheDocument();
  });

  it('shows an error message on fetch failure', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('Service unavailable'));
    render(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
