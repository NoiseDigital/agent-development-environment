// Client directory — the read surface every UI uses to look up a client by
// id (badge / logo / accent color). Re-exports the in-memory list from
// media-model so existing data stays the source of truth; once the gateway
// exposes /api/clients backed by Postgres, this module becomes a hook that
// reads from there and the rest of the UI is unchanged.

import { clients, type Client } from './media-model';

export type { Client };

const bySlug = new Map(clients.map((c) => [c.id, c]));
const NOI: Client = bySlug.get('noi') ?? clients[0];

/** A client by slug. Falls back to the NOI default so the UI never sees
 *  `undefined` — an unknown slug renders with the platform's brand mark. */
export function clientBySlug(slug: string | undefined): Client {
  if (!slug) return NOI;
  return bySlug.get(slug) ?? NOI;
}

/** All clients — already a small set today. */
export function listClients(): readonly Client[] {
  return clients;
}
