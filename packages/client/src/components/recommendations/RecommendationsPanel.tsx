import { useState, useEffect } from 'react';
import { fetchRecommendations as fetchRecommendationsService } from '../../services/inventory';
import { DietaryPreferences } from './DietaryPreferences';

const STORAGE_KEY = 'fridge-planner:dietary-preferences';

function loadPreferences(): string[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) as string[] : [];
  } catch {
    return [];
  }
}

interface Props {
  fetchRecommendations?: (preferences: string[]) => Promise<string>;
}

type State = 'idle' | 'loading' | 'success' | 'error';

export function RecommendationsPanel({ fetchRecommendations: fetchFn = fetchRecommendationsService }: Props): React.JSX.Element {
  const [state, setState] = useState<State>('idle');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');
  const [preferences, setPreferences] = useState<string[]>(loadPreferences);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    } catch {
      // localStorage may be unavailable
    }
  }, [preferences]);

  async function handleFetch(): Promise<void> {
    setState('loading');
    setError('');
    try {
      const result = await fetchFn(preferences);
      setContent(result);
      setState('success');
    } catch {
      setError('Could not load recommendations. Please try again.');
      setState('error');
    }
  }

  return (
    <section aria-label="Meal recommendations" className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">AI Meal Recommendations</h2>

      <DietaryPreferences selected={preferences} onChange={setPreferences} />

      <button
        onClick={() => { void handleFetch(); }}
        disabled={state === 'loading'}
        className="w-full rounded-lg bg-green-600 px-4 py-2 text-white font-medium hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {state === 'loading' ? 'Thinking…' : 'Get Recommendations'}
      </button>

      {state === 'loading' && (
        <p className="mt-4 text-sm text-gray-500 animate-pulse">Loading meal ideas…</p>
      )}

      {state === 'error' && (
        <p role="alert" className="mt-4 text-sm text-red-600 bg-red-50 rounded-lg p-3">
          {error}
        </p>
      )}

      {state === 'success' && (
        <div className="mt-4 text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
          {content}
        </div>
      )}
    </section>
  );
}
