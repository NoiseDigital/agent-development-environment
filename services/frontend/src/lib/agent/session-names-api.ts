// Client for the session-metadata API on the agent service.
// Names + the hidden (soft-deleted) flag are keyed by the ADK session identity
// and persisted server-side. Soft-deletes survive across devices and reloads.

import { apiRequest } from '../api/http';
import { gatewayBase } from '@/lib/api/gateway';

const BASE_URL = gatewayBase();

export interface SessionMeta {
  /** Per-session display name, keyed by ADK session id. */
  names: Record<string, string>;
  /** Session ids the user has soft-deleted. */
  hidden: string[];
}

export const sessionNamesApi = {
  /** Session metadata for an app + user — names and hidden ids. */
  async list(appName: string, userId = 'user-1'): Promise<SessionMeta> {
    const q = new URLSearchParams({ app_name: appName, user_id: userId });
    const data = await apiRequest<Partial<SessionMeta>>(
      `${BASE_URL}/api/session-names?${q}`,
    );
    return { names: data.names ?? {}, hidden: data.hidden ?? [] };
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

  /** Soft-delete: hide the session in the UI while keeping ADK's data. */
  async hide(appName: string, sessionId: string, userId = 'user-1'): Promise<void> {
    await apiRequest<unknown>(`${BASE_URL}/api/session-names/hide`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        app_name: appName,
        user_id: userId,
        session_id: sessionId,
      }),
    });
  },

  /** Hard-delete the metadata row — used when the ADK session is also being
   *  hard-deleted (e.g. empty-session auto-cleanup). */
  async remove(appName: string, sessionId: string, userId = 'user-1'): Promise<void> {
    const q = new URLSearchParams({
      app_name: appName,
      session_id: sessionId,
      user_id: userId,
    });
    await apiRequest<unknown>(`${BASE_URL}/api/session-names?${q}`, { method: 'DELETE' });
  },
};
