// Pinned-charts client — talks to the agent's /api/pins endpoints (through
// the gateway). Pins were previously kept in localStorage; persisting them
// server-side means they survive across devices, reloads, and incognito
// sessions, the same as session metadata and event ratings.

import { apiRequest } from '../api/http';
import type { VegaSpec } from '../../types/genui';
import { gatewayBase } from '@/lib/api/gateway';

const BASE_URL = gatewayBase();

export interface PinnedChart {
  id: string;
  spec: VegaSpec;
  /** ISO-8601 server timestamp for display ordering. */
  created_at?: string;
}

export const pinsApi = {
  /** All pins for one dashboard + tab, oldest first. */
  async list(dashboardId: string, tabId: string): Promise<PinnedChart[]> {
    const q = new URLSearchParams({ dashboard_id: dashboardId, tab_id: tabId });
    const data = await apiRequest<{ pins: PinnedChart[] }>(
      `${BASE_URL}/api/pins?${q}`,
    );
    return data.pins ?? [];
  },

  /** Pin one chart to a dashboard tab. Returns the new pin so the caller
   *  can render it immediately without waiting for a list refresh. */
  async create(dashboardId: string, tabId: string, spec: VegaSpec): Promise<PinnedChart> {
    const data = await apiRequest<{ pin: PinnedChart }>(`${BASE_URL}/api/pins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dashboard_id: dashboardId, tab_id: tabId, spec }),
    });
    return data.pin;
  },

  /** Unpin one chart. The server scopes the delete to the current user. */
  async remove(pinId: string): Promise<void> {
    await apiRequest<unknown>(`${BASE_URL}/api/pins/${pinId}`, { method: 'DELETE' });
  },
};
