'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { PipelineItem, PipelineItemSummary, TransitionRequest } from '../services/pipeline';
import { fetchPipeline, promoteFeedback, transitionPipelineItem as sendTransition } from '../services/pipeline';

interface PipelineContextValue {
  items: PipelineItemSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
  promote: (feedbackId: string) => Promise<PipelineItem>;
  transition: (id: string, body: TransitionRequest) => Promise<PipelineItem>;
}

const PipelineContext = createContext<PipelineContextValue | null>(null);

/** DL3 status-view provider — mirrors FeedbackContext's records/refreshList pattern (D8). */
export function PipelineProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [items, setItems] = useState<PipelineItemSummary[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      setItems(await fetchPipeline());
    } catch {
      // Non-fatal for the surrounding surface; the list simply stays as-is.
    } finally {
      setLoading(false);
    }
  }, []);

  const promote = useCallback(
    async (feedbackId: string): Promise<PipelineItem> => {
      const item = await promoteFeedback(feedbackId);
      await refresh();
      return item;
    },
    [refresh],
  );

  const transition = useCallback(
    async (id: string, body: TransitionRequest): Promise<PipelineItem> => {
      const item = await sendTransition(id, body);
      await refresh();
      return item;
    },
    [refresh],
  );

  return (
    <PipelineContext.Provider value={{ items, loading, refresh, promote, transition }}>
      {children}
    </PipelineContext.Provider>
  );
}

export function usePipeline(): PipelineContextValue {
  const ctx = useContext(PipelineContext);
  if (!ctx) throw new Error('usePipeline must be used within a PipelineProvider');
  return ctx;
}
