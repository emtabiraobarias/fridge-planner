'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { FeedbackMessage, FeedbackRecord } from '../services/feedback';
import {
  deleteFeedbackRecord,
  fetchFeedbackList,
  sendFeedbackMessage,
  startFeedback,
} from '../services/feedback';

export type ChatState = 'idle' | 'sending' | 'awaiting-user' | 'complete' | 'error';

interface FeedbackContextValue {
  // Chat
  chatState: ChatState;
  conversationId: string | null;
  messages: FeedbackMessage[];
  completedRecord: FeedbackRecord | null;
  error: string;
  send: (message: string) => Promise<void>;
  reset: () => void;
  // Review list
  records: FeedbackRecord[];
  listLoading: boolean;
  refreshList: () => Promise<void>;
  remove: (id: string) => Promise<void>;
}

const FeedbackContext = createContext<FeedbackContextValue | null>(null);

export function FeedbackProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [chatState, setChatState] = useState<ChatState>('idle');
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<FeedbackMessage[]>([]);
  const [completedRecord, setCompletedRecord] = useState<FeedbackRecord | null>(null);
  const [error, setError] = useState('');

  const [records, setRecords] = useState<FeedbackRecord[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const refreshList = useCallback(async (): Promise<void> => {
    setListLoading(true);
    try {
      setRecords(await fetchFeedbackList());
    } catch {
      // Non-fatal for the chat surface; the list simply stays as-is.
    } finally {
      setListLoading(false);
    }
  }, []);

  const send = useCallback(
    async (message: string): Promise<void> => {
      const trimmed = message.trim();
      if (trimmed === '' || chatState === 'sending' || chatState === 'complete') return;

      // Optimistically show the user's message immediately (SC-F-005 pending state).
      const optimistic: FeedbackMessage = { role: 'user', content: trimmed, at: new Date().toISOString() };
      setMessages((prev) => [...prev, optimistic]);
      setChatState('sending');
      setError('');

      try {
        const turn = conversationId
          ? await sendFeedbackMessage(conversationId, trimmed)
          : await startFeedback(trimmed);

        setConversationId(turn.feedback._id);
        // The server transcript is authoritative (includes the agent reply).
        setMessages(turn.feedback.transcript ?? []);

        if (turn.status === 'complete') {
          setCompletedRecord(turn.feedback);
          setChatState('complete');
          void refreshList();
        } else {
          setChatState('awaiting-user');
        }
      } catch (err) {
        // Keep the optimistic user message so nothing is lost; allow retry (US1-S3).
        setChatState('error');
        setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      }
    },
    [chatState, conversationId, refreshList],
  );

  const reset = useCallback((): void => {
    setChatState('idle');
    setConversationId(null);
    setMessages([]);
    setCompletedRecord(null);
    setError('');
  }, []);

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteFeedbackRecord(id);
      setRecords((prev) => prev.filter((r) => r._id !== id));
    },
    [],
  );

  return (
    <FeedbackContext.Provider
      value={{
        chatState,
        conversationId,
        messages,
        completedRecord,
        error,
        send,
        reset,
        records,
        listLoading,
        refreshList,
        remove,
      }}
    >
      {children}
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackContextValue {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error('useFeedback must be used within a FeedbackProvider');
  return ctx;
}

export function useFeedbackOptional(): FeedbackContextValue | null {
  return useContext(FeedbackContext);
}
