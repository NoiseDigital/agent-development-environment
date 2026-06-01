// Per-dashboard "last refreshed" timestamp — stored in localStorage.
//
// ── Why localStorage, not Postgres ───────────────────────────────────────
//
// This value is per-device, per-user UX feedback: "when did I, on this
// browser, last pull BigQuery data for this dashboard". It does NOT need to
// sync across devices (a fresh login on a new device legitimately starts at
// "never refreshed yet"), it's never aggregated, and losing it is harmless.
//
// localStorage is the right home for that. Backing it with a Postgres column
// would mean a network round-trip on every dashboard mount, a write on every
// refresh, and cross-user/cross-device coordination semantics we don't want.
//
// ── Storage taxonomy in this app (the broader principle) ─────────────────
//
// localStorage:
//   - Per-device UX feedback (last-refresh-at, recently-collapsed sidebars,
//     last-viewed tab, transient toast acks).
//   - User preferences that are happily reset on a fresh device.
//
// Postgres (gateway-owned tables):
//   - Anything identity-bearing that should follow the user across devices
//     (pinned charts, session metadata, event ratings, sources).
//   - Anything multi-user or shareable (dashboards, share links).
//   - Anything an admin / audit flow needs to query in aggregate.
//
// React in-memory (no persistence):
//   - Filter selections, modal open/close, drag state — anything that resets
//     on a page reload by design.

const KEY_PREFIX = 'noise:dashboard:last-refreshed-at:';

/** Persist that the user just successfully loaded `dashboardId`. */
export function markDashboardRefreshed(dashboardId: string, when = Date.now()): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${KEY_PREFIX}${dashboardId}`, String(when));
  } catch {
    /* quota or privacy-mode block — refresh marker is non-critical, swallow */
  }
}

/** Read the last-refreshed epoch ms, or null if never recorded. */
export function readLastRefreshed(dashboardId: string): number | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${KEY_PREFIX}${dashboardId}`);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

/** Human-readable relative time. Returns "Just now" / "5 min ago" /
 *  "2 hours ago" / "Yesterday" / an absolute date for older timestamps. */
export function formatRefreshTime(when: number, now = Date.now()): string {
  const diff = Math.max(0, now - when);
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  // > a week — show the absolute date (no time). Uses en-CA so server +
  // client agree on YYYY-MM-DD parsing without a tz shift.
  return new Date(when).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
