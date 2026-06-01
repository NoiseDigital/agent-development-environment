// Client for the per-message feedback API on the agent service.
// Ratings are keyed by the ADK event id of the message they apply to.

import { apiRequest } from '../http';

const BASE_URL = process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8000';

export type Rating = 'up' | 'down';

interface FeedbackRow {
  event_id: string;
  rating: Rating;
}

export const feedbackApi = {
  /** All ratings for a session, as an { [eventId]: rating } map. */
  async listForSession(
    appName: string,
    sessionId: string,
    userId = 'user-1',
  ): Promise<Record<string, Rating>> {
    const q = new URLSearchParams({ app_name: appName, session_id: sessionId, user_id: userId });
    const data = await apiRequest<{ feedback: FeedbackRow[] }>(`${BASE_URL}/api/feedback?${q}`);
    return Object.fromEntries(data.feedback.map((f) => [f.event_id, f.rating]));
  },

  /** Set (up/down) or clear (null) the rating for one message. */
  async setRating(
    appName: string,
    sessionId: string,
    eventId: string,
    rating: Rating | null,
    userId = 'user-1',
  ): Promise<void> {
    await apiRequest<unknown>(`${BASE_URL}/api/feedback`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_name: appName,
        user_id: userId,
        session_id: sessionId,
        event_id: eventId,
        rating,
      }),
    });
  },

  /** Remove all of a session's ratings — called when the session is deleted. */
  async clearSession(appName: string, sessionId: string, userId = 'user-1'): Promise<void> {
    const q = new URLSearchParams({ app_name: appName, session_id: sessionId, user_id: userId });
    await apiRequest<unknown>(`${BASE_URL}/api/feedback?${q}`, { method: 'DELETE' });
  },
};
