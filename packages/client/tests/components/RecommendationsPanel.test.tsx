import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { RecommendationsPanel } from '../../src/components/recommendations/RecommendationsPanel';
import { RecommendationsProvider } from '../../src/context/RecommendationsContext';
import { InventoryProvider } from '../../src/context/InventoryContext';
import type { MealRecommendation } from '../../src/types/meal-recommendation';

vi.mock('../../src/services/inventory', () => ({
  fetchInventory: vi.fn().mockResolvedValue({ items: [], summary: { total: 0, expired: 0, expiringSoon: 0 } }),
  fetchRecommendations: vi.fn(),
  createItem: vi.fn(),
  updateItem: vi.fn(),
  deleteItem: vi.fn(),
}));

const mockMeal: MealRecommendation = {
  mealName: 'Chicken Stir-fry',
  suggestedMealType: 'dinner',
  prepTimeMinutes: 20,
  cuisine: 'Asian',
  description: 'Quick stir-fry using chicken before it expires.',
  usesIngredients: ['chicken breast', 'rice'],
  expiringIngredients: ['chicken breast'],
  missingIngredients: ['soy sauce'],
};

function renderWithProviders(ui: React.ReactElement): ReturnType<typeof render> {
  return render(
    <InventoryProvider>
      <RecommendationsProvider>
        {ui}
      </RecommendationsProvider>
    </InventoryProvider>,
  );
}

describe('RecommendationsPanel', () => {
  it('shows a button to fetch recommendations', () => {
    renderWithProviders(<RecommendationsPanel />);
    expect(screen.getByRole('button', { name: /get.*recommendation/i })).toBeInTheDocument();
  });

  it('shows loading state while fetching', async () => {
    const slowFetch = vi.fn(() => new Promise<MealRecommendation[]>(() => {})); // never resolves
    renderWithProviders(<RecommendationsPanel fetchRecommendations={slowFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByRole('list', { name: /loading meal recommendations/i })).toBeInTheDocument();
  });

  it('renders a meal card with meal name after successful fetch', async () => {
    const mockFetch = vi.fn<() => Promise<MealRecommendation[]>>().mockResolvedValue([mockMeal]);
    renderWithProviders(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByText('Chicken Stir-fry')).toBeInTheDocument();
  });

  it('renders cuisine badge and prep time on meal card', async () => {
    const mockFetch = vi.fn<() => Promise<MealRecommendation[]>>().mockResolvedValue([mockMeal]);
    renderWithProviders(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    await screen.findByText('Chicken Stir-fry');
    expect(screen.getByText('Asian')).toBeInTheDocument();
    expect(screen.getByText(/20 min/)).toBeInTheDocument();
  });

  it('renders expiring ingredient with warning indicator', async () => {
    const mockFetch = vi.fn<() => Promise<MealRecommendation[]>>().mockResolvedValue([mockMeal]);
    renderWithProviders(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    await screen.findByText('Chicken Stir-fry');
    expect(screen.getByText(/⚠️.*chicken breast/i)).toBeInTheDocument();
  });

  it('renders missing ingredients with "Need:" prefix', async () => {
    const mockFetch = vi.fn<() => Promise<MealRecommendation[]>>().mockResolvedValue([mockMeal]);
    renderWithProviders(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    await screen.findByText('Chicken Stir-fry');
    expect(screen.getByText(/need:.*soy sauce/i)).toBeInTheDocument();
  });

  it('shows empty state message when no meals returned', async () => {
    const mockFetch = vi.fn<() => Promise<MealRecommendation[]>>().mockResolvedValue([]);
    renderWithProviders(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByText(/no suggestions.*ingredient/i)).toBeInTheDocument();
  });

  it('shows an error message on fetch failure', async () => {
    const mockFetch = vi.fn<() => Promise<MealRecommendation[]>>().mockRejectedValue(new Error('Service unavailable'));
    renderWithProviders(<RecommendationsPanel fetchRecommendations={mockFetch} />);
    fireEvent.click(screen.getByRole('button', { name: /get.*recommendation/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
