'use client';

// Per-message thumb feedback for the active chat session — load on session
// switch + optimistic toggle + revert on API failure. Extracted from useChat
// because it's self-contained: depends only on (selectedApp, currentSession,
// userId) and doesn't share state with the stream / sessions logic.

import { useEffect, useState } from 'react';
import { feedbackApi, type Rating } from '../lib/agent/feedback-api';
import type { Session } from '../lib/agent/adk-api';

export type { Rating };

interface UseChatFeedbackArgs {
  selectedApp: string | null;
  currentSession: Session | null;
  userId: string;
}

export interface UseChatFeedback {
  /** Ratings keyed by ADK event id, scoped to the active session. */
  feedback: Record<string, Rating>;
  /** Set or clear (rating=null) the thumb rating for one message. Optimistic;
   *  reverts in place when the API call fails. */
  rateMessage: (eventId: string, rating: Rating | null) => Promise<void>;
}

export function useChatFeedback({
  selectedApp,
  currentSession,
  userId,
}: UseChatFeedbackArgs): UseChatFeedback {
  const [feedback, setFeedback] = useState<Record<string, Rating>>({});

  // Reload per-message ratings whenever the active session changes.
  useEffect(() => {
    if (!selectedApp || !currentSession || !userId) {
      setFeedback({});
      return;
    }
    let cancelled = false;
    const sessionId = currentSession.id;
    feedbackApi
      .listForSession(selectedApp, sessionId, userId)
      .then((map) => { if (!cancelled) setFeedback(map); })
      .catch((err) => {
        if (cancelled) return;
        console.warn('[useChatFeedback] failed to load for session', sessionId, err);
        setFeedback({});
      });
    return () => { cancelled = true; };
  }, [selectedApp, currentSession?.id, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const rateMessage = async (eventId: string, rating: Rating | null) => {
    if (!selectedApp || !currentSession) return;
    const previous = feedback[eventId] ?? null;
    // Optimistic write — keep the UI responsive even on slow networks.
    setFeedback((prev) => {
      const next = { ...prev };
      if (rating) next[eventId] = rating;
      else delete next[eventId];
      return next;
    });
    try {
      await feedbackApi.setRating(selectedApp, currentSession.id, eventId, rating, userId);
    } catch (err) {
      // Log loudly so a feedback-endpoint regression isn't silent — and
      // revert the optimistic write so the UI reflects server truth.
      console.warn('[useChatFeedback] rate failed for event', eventId, err);
      setFeedback((prev) => {
        const next = { ...prev };
        if (previous) next[eventId] = previous;
        else delete next[eventId];
        return next;
      });
    }
  };

  return { feedback, rateMessage };
}
