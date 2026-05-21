// Authentication seam (frontend).
//
// The whole UI reads the current identity through this module. Today it returns
// a fixed development identity and `authHeaders()` is empty. When Firebase Auth
// is wired in, only this file changes — `getCurrentUser` reads the signed-in
// Firebase user and `authHeaders` returns a real `Authorization: Bearer
// <idToken>`. Callers (useChat, the API clients, ChatMessage) don't change.

export type Role = 'admin' | 'member' | 'viewer';

export interface CurrentUser {
  uid: string;
  role: Role;
}

// The dev identity used until Firebase is wired in. Kept as 'user-1' so existing
// sessions and saved data (all keyed by that id) still resolve.
const DEV_USER: CurrentUser = { uid: 'user-1', role: 'admin' };

/** The current user. Sync + fixed today; Firebase-backed later. */
export function getCurrentUser(): CurrentUser {
  return DEV_USER;
}

/**
 * Identity headers to merge into an API request. Empty today; once auth is live
 * this returns `{ Authorization: 'Bearer <idToken>' }`. Wired into lib/http so
 * every platform API call carries it automatically.
 */
export function authHeaders(): Record<string, string> {
  return {};
}

/** Coarse role gate for admin-only UI (e.g. the SQL-query inspector). */
export const isAdmin = getCurrentUser().role === 'admin';
