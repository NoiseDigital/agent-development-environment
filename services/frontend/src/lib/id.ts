// Stable unique IDs for user-created entities. crypto.randomUUID needs a secure
// context (localhost counts) — the fallback keeps SSR and older runtimes safe.
// An optional prefix keeps IDs legible in URLs and stores without losing the
// uniqueness of a UUID body.

export function newId(prefix = ''): string {
  const uuid =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return prefix ? `${prefix}-${uuid}` : uuid;
}
