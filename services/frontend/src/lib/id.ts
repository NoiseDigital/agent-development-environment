// Stable unique IDs for user-created entities. crypto.randomUUID needs a
// secure context (localhost counts) — the fallback keeps SSR and older
// runtimes safe.
//
// URL-facing IDs (sessions, dashboards) are bare UUIDs: the path already
// names the entity type (`/dashboards/<id>`, `/chat/<agent>/<id>`), so a
// `dash-` / `session-` prefix would be redundant noise.
//
// Internal IDs (pinned-tile, text-tile, change, codify request) keep their
// prefix because they double as runtime discriminators — e.g. a tile id
// starting with `pin-` flags a user-pinned tile that must persist on remove.

export function newId(prefix = ''): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${uuid}` : uuid;
}
