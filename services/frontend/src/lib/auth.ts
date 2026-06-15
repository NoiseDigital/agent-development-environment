// Authentication seam (frontend).
//
// The signed-in Firebase user is the source of truth. `AuthProvider`
// (lib/firebase/auth-context) pushes the current user into a module-level cache
// here on every auth-state change, so sync callers (`getCurrentUser`/`isAdmin`)
// keep working unchanged while the real identity flows through.
//
// Requests authenticate via the httpOnly `__session` cookie (set by
// /api/auth/session), which rides same-origin `/gw` calls automatically — so
// `authHeaders()` stays empty. The BFF proxy verifies that cookie and forwards
// the identity to the gateway.
import type { User } from "firebase/auth";

export type Role = "admin" | "member" | "viewer";

export interface CurrentUser {
  uid: string;
  email?: string | null;
  role: Role;
}

// Fallback before auth resolves / during SSR. uid 'user-1' keeps existing
// locally-keyed dev data resolving until it's migrated to real Firebase uids.
const ANON: CurrentUser = { uid: "user-1", email: null, role: "admin" };

let _current: CurrentUser = ANON;

/** Called by AuthProvider on every Firebase auth-state change. */
export function setCurrentUserCache(user: User | null): void {
  _current = user
    ? { uid: user.uid, email: user.email, role: roleFromUser() }
    : ANON;
}

function roleFromUser(): Role {
  // Role will come from a custom claim once the gateway's `users` table owns it.
  // Default 'admin' in this single-tenant early phase so nothing is gated yet.
  // TODO(rbac): read the `role` custom claim and default to 'member'.
  return "admin";
}

/** The current user. Sync; backed by the auth-state cache above. */
export function getCurrentUser(): CurrentUser {
  return _current;
}

/**
 * Identity headers to merge into an API request. Empty — the httpOnly session
 * cookie carries identity. Kept as a seam so callers don't change if we ever
 * move to a bearer scheme.
 */
export function authHeaders(): Record<string, string> {
  return {};
}

/** Coarse role gate for admin-only UI (e.g. the SQL-query inspector). */
export const isAdmin = getCurrentUser().role === "admin";
