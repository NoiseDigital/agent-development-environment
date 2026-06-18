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

// Fallback before auth resolves / during SSR.
//
// LOCAL ONLY (Firebase emulator, no login): the stable dev uid keeps locally
// keyed ADK sessions/data resolving, and admin so the no-login stack is usable.
//
// DEPLOYED: never use the dev identity — a real Firebase uid always resolves
// first, and the dev uid must not reach a production DB (incl. ADK session
// tables). Empty uid + least-privilege; callers must skip identity-keyed calls
// until a real uid resolves (the ADK hooks guard on it).
const IS_LOCAL = !!process.env.NEXT_PUBLIC_FIREBASE_AUTH_EMULATOR_HOST;
const ANON: CurrentUser = IS_LOCAL
  ? { uid: "user-1", email: null, role: "admin" }
  : { uid: "", email: null, role: "member" };

let _current: CurrentUser = ANON;

/** Called by AuthProvider on every Firebase auth-state change. A freshly
 * signed-in user starts at least-privilege ('member') until `/me` resolves the
 * real role (see setCurrentUserRole), so admin UI never flashes for non-admins. */
export function setCurrentUserCache(user: User | null): void {
  _current = user
    ? { uid: user.uid, email: user.email, role: "member" }
    : ANON;
}

/** Called by AuthProvider once GET /api/v1/me returns the DB-authoritative role. */
export function setCurrentUserRole(role: Role): void {
  _current = { ..._current, role };
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

/** Coarse role gate for admin-only UI (e.g. the SQL-query inspector). A live
 * function (not a const) so it reflects the role once `/me` resolves. */
export function isAdmin(): boolean {
  return _current.role === "admin";
}
