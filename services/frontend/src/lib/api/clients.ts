// Client directory API — talks to the gateway's /api/v1/clients endpoint.
// One row per ad-client (Noise / NOI today). The dashboards list, the New
// Dashboard form, and any future client-scoped UI all read from here so the
// frontend's client list is the same one the database holds.

import { apiRequest } from './http';
import { gatewayBase } from '@/lib/api/gateway';

const BASE_URL = gatewayBase();

export interface ClientRecord {
  id: string;
  slug: string;
  name: string;
  initials: string;
  accent_color: string;
  logo_path: string | null;
}

export const clientsApi = {
  /** Every client. Small set; no pagination needed. */
  async list(): Promise<ClientRecord[]> {
    const data = await apiRequest<{ clients: ClientRecord[] }>(
      `${BASE_URL}/api/v1/clients`,
    );
    return data.clients ?? [];
  },
};
