// Client codes — the canonical short identifier for each ad-client.
//
// The code is a stable, URL-safe handle that appears in dashboard routes
// (`/dashboards/NOI`), in chart references, and anywhere a human-readable
// client reference reads better than a UUID. Codes match the `initials`
// column on the `clients` Postgres table uppercased — same identity, two
// presentations (UI: uppercase; database slug: lowercase).
//
// The SET of known codes is per-tenant — it lives in the active tenant's
// content (data/tenants/<id>/clients.ts, as `KNOWN_CLIENT_CODES`) and resolves
// here via the @tenant-content build alias. This module keeps the typed helpers.
// Adding a client to a tenant is THREE coordinated changes (all under that
// tenant's content dir):
//   1. INSERT into the `clients` table (Alembic migration or admin path).
//   2. Add the code to data/tenants/<id>/clients.ts (so TS narrows routes).
//   3. Add the dashboard seed in data/tenants/<id>/dashboards.ts (id IS the
//      code, so the canonical report lives at /dashboards/<CODE>).
//
// In production the `clients` table is authoritative; this list mirrors it
// so the frontend can do compile-time checks without a network round-trip.

/** Every known client code for the active tenant. Tuple (`as const` at the
 *  source), so the type below narrows to the literal union. */
export { KNOWN_CLIENT_CODES } from '@tenant-content/clients';
import { KNOWN_CLIENT_CODES } from '@tenant-content/clients';

/** A code in the known set — type-checked at compile time. Use this for
 *  routes, dashboard ids, and any place that should reject typos at build. */
export type ClientCode = (typeof KNOWN_CLIENT_CODES)[number];

/** Whether `s` is a known client code — type guard. */
export function isClientCode(s: string | undefined | null): s is ClientCode {
  return !!s && (KNOWN_CLIENT_CODES as readonly string[]).includes(s);
}

/** Slug → code (`noi` → `NOI`). The slug is the database identity; the code
 *  is the user-facing form. The clients table holds both, so this helper is
 *  the bridge for the rare case where you only have the slug. */
export function codeFromSlug(slug: string | undefined): ClientCode | null {
  if (!slug) return null;
  const upper = slug.toUpperCase();
  return isClientCode(upper) ? upper : null;
}
