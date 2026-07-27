'use client';
import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import type { FeedbackMessage, FeedbackRecord } from '../services/feedback';
import {
  deleteFeedbackRecord,
  fetchFeedbackList,
  fetchFeedbackRecord,
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
  /** Non-empty when a list-level operation failed, so failures are never silent (FR-F-021). */
  listError: string;
  refreshList: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  /** Reopen a stored record into the chat with its transcript intact (FR-F-012, US3-S1). */
  resume: (id: string) => Promise<void>;
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
  const [listError, setListError] = useState('');

  const refreshList = useCallback(async (): Promise<void> => {
    setListLoading(true);
    setListError('');
    try {
      setRecords(await fetchFeedbackList());
    } catch {
      // Still non-fatal for the chat surface, but no longer SILENT: swallowing this made a
      // failed load render as the "no feedback yet" empty state, telling a user with records
      // that they had none (FR-F-021).
      setListError('Could not load your feedback. Check your connection and try Refresh.');
    } finally {
      setListLoading(false);
    }
  }, []);

  const send = useCallback(
    async (message: string): Promise<void> => {
      const trimmed = message.trim();
      if (trimmed === '' || chatState === 'sending' || chatState === 'complete') return;

      // Optimistically show the user's message immediately (SC-F-005 pending state).
      const optimistic: FeedbackMessage = {
        role: 'user',
        content: trimmed,
        at: new Date().toISOString(),
      };
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
      setListError('');
      try {
        await deleteFeedbackRecord(id);
      } catch (err) {
        // Previously this rejection escaped into a floating `void remove(...)` and the
        // Delete button appeared to do nothing — most visibly for the pipeline-protected
        // 409, whose whole point is to tell the user to park the item first (FR-F-021 and
        // the "Delete a promoted record" edge case).
        setListError(
          err instanceof Error ? err.message : 'Could not delete that feedback. Please try again.',
        );
        return;
      }
      setRecords((prev) => prev.filter((r) => r._id !== id));
      // Deleting the record currently open would otherwise leave the chat pointed at a
      // record that no longer exists, so the next message would fail as "not found".
      if (conversationId === id) reset();
    },
    [conversationId, reset],
  );

  const resume = useCallback(async (id: string): Promise<void> => {
    setListError('');
    setError('');
    try {
      const record = await fetchFeedbackRecord(id);
      setConversationId(record._id);
      // The stored transcript IS the context — the backend replays it to the assistant on
      // every turn (it is stateless), so a resumed draft continues with full awareness.
      setMessages(record.transcript ?? []);
      if (record.status === 'draft') {
        setCompletedRecord(null);
        setChatState('awaiting-user');
      } else {
        // A finished record reopens read-only: the composer stays hidden, which is how
        // US3-S3's "already completed" refusal is expressed in the UI.
        setCompletedRecord(record);
        setChatState('complete');
      }
    } catch {
      setListError('Could not reopen that feedback. Please try again.');
    }
  }, []);

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
        listError,
        refreshList,
        remove,
        resume,
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
