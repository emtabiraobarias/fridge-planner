import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RecommendationsPanel } from '../../src/components/recommendations/RecommendationsPanel';

describe('RecommendationsPanel', () => {
  it('shows a button to fetch recommendations', () => {
    render(<RecommendationsPanel />);
    expect(screen.getByRole('button', { name: /get.*recommendation/i })).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    const slowFetch = vi.fn((_preferences: string[]) => new Promise<string>(() => {})); // never resolves
    render(<RecommendationsPanel fetchRecommendations={slowFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByText(/loading.*meal|meal.*idea/i)).toBeInTheDocument();
  });

  it('displays recommendation content after successful fetch', async () => {
    const mockFetch = vi.fn<(preferences: string[]) => Promise<string>>().mockResolvedValue('Try Chicken Stir-fry!');
    render(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByText(/chicken stir-fry/i)).toBeInTheDocument();
  });

  it('shows an error message on fetch failure', async () => {
    const mockFetch = vi.fn<(preferences: string[]) => Promise<string>>().mockRejectedValue(new Error('Service unavailable'));
    render(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('renders dietary preferences fieldset', () => {
    render(<RecommendationsPanel />);
    expect(screen.getByText('Dietary Preferences')).toBeInTheDocument();
  });

  it('passes selected preferences to fetch function', async () => {
    const mockFetch = vi.fn<(preferences: string[]) => Promise<string>>().mockResolvedValue('Vegan bowl');
    render(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(expect.any(Array));
    });
  });
});
