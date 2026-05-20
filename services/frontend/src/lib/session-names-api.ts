// Client for the session display-name API on the agent service.
// Names are keyed by the ADK session identity and persisted server-side.

import { apiRequest } from './http';

const BASE_URL = process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8000';

export const sessionNamesApi = {
  /** All session display names for an app + user, as { [sessionId]: name }. */
  async list(appName: string, userId = 'user-1'): Promise<Record<string, string>> {
    const q = new URLSearchParams({ app_name: appName, user_id: userId });
    const data = await apiRequest<{ names: Record<string, string> }>(
      `${BASE_URL}/api/session-names?${q}`,
    );
    return data.names;
  },

  /** Set the display name for one session. */
  async set(
    appName: string,
    sessionId: string,
    displayName: string,
    userId = 'user-1',
  ): Promise<void> {
    await apiRequest<unknown>(`${BASE_URL}/api/session-names`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_name: appName,
        user_id: userId,
        session_id: sessionId,
        display_name: displayName,
      }),
    });
  },

  /** Remove a session's name — called when the session is deleted. */
  async remove(appName: string, sessionId: string, userId = 'user-1'): Promise<void> {
    const q = new URLSearchParams({
      app_name: appName,
      session_id: sessionId,
      user_id: userId,
    });
    await apiRequest<unknown>(`${BASE_URL}/api/session-names?${q}`, { method: 'DELETE' });
  },
};
