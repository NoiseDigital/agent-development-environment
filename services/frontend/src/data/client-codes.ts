// Client codes — the canonical short identifier for each ad-client.
//
// The code is a stable, URL-safe handle that appears in dashboard routes
// (`/dashboards/NOI`), in chart references, and anywhere a human-readable
// client reference reads better than a UUID. Codes match the `initials`
// column on the `clients` Postgres table uppercased — same identity, two
// presentations (UI: uppercase; database slug: lowercase).
//
// This module is the typed source of truth for the SET of known codes.
// Adding a new client is THREE coordinated changes:
//   1. INSERT into the `clients` table (Alembic migration or admin path).
//   2. Add the code below (so TypeScript narrows routes / lookups).
//   3. Add a `data/dashboards/clients/<code>.ts` file (see noi.ts for the
//      template) and register it in `data/dashboards/clients/index.ts`. The
//      dashboard's `id` IS the code, so the canonical report lives at
//      `/dashboards/<CODE>`.
//
// In production the `clients` table is authoritative; this list mirrors it
// so the frontend can do compile-time checks without a network round-trip.

/** Every known client code. Tuple, not just `string[]`, so the type below
 *  narrows to the literal union. */
export const KNOWN_CLIENT_CODES = ['NOI'] as const;

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
