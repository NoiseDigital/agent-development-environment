// Client directory API — talks to the gateway's /api/clients endpoint.
// One row per ad-client (Noise / NOI today). The dashboards list, the New
// Dashboard form, and any future client-scoped UI all read from here so the
// frontend's client list is the same one the database holds.

import { apiRequest } from './http';

const BASE_URL = process.env.NEXT_PUBLIC_AGENTS_BASE_URL || 'http://localhost:8080';

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
      `${BASE_URL}/api/clients`,
    );
    return data.clients ?? [];
  },
};
