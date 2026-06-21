// Client directory — the read surface every UI uses to look up a client by
// id (badge / logo / accent color). The registry itself is per-tenant
// (data/tenants/<id>/clients.ts, resolved via the @tenant-content build alias);
// once the gateway exposes /api/v1/clients backed by Postgres, this module
// becomes a hook that reads from there and the rest of the UI is unchanged.

import type { Client } from './media-model';
import { clients } from '@tenant-content/clients';

export type { Client };

const bySlug = new Map(clients.map((c) => [c.id, c]));

/** Synthetic fallback so the UI never sees `undefined` — for an unknown slug,
 *  or a tenant with no client registry at all (e.g. analyze-only tenants). */
const FALLBACK: Client = clients[0] ?? {
  id: 'unknown',
  name: 'Client',
  initials: '—',
  accentColor: '#000000',
};

/** A client by slug. Falls back to the default so the UI never sees
 *  `undefined` — an unknown slug renders with the platform's brand mark. */
export function clientBySlug(slug: string | undefined): Client {
  if (!slug) return FALLBACK;
  return bySlug.get(slug) ?? FALLBACK;
}

/** All clients — already a small set today. */
export function listClients(): readonly Client[] {
  return clients;
}

/** The tenant's primary client (first in the registry) — the default scope for
 *  user-created content. Falls back to the synthetic client for empty tenants. */
export function defaultClient(): Client {
  return clients[0] ?? FALLBACK;
}
