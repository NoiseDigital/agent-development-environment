// Client-side auth context — drives UI (current user, sign-out) and keeps the
// sync `getCurrentUser()` seam (lib/auth) in step with the Firebase session.
// The authoritative gate is server-side (the httpOnly session cookie + the BFF
// proxy + middleware); this is for presentation.
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { onAuthStateChanged, signOut as fbSignOut, type User } from "firebase/auth";

import { auth } from "./client";
import { setCurrentUserCache, setCurrentUserRole, type Role } from "@/lib/auth";
import { meApi, type MeRecord } from "@/lib/api/me";
import { track } from "@/lib/analytics/track";

interface AuthState {
  user: User | null;
  /** DB-authoritative directory record (role, etc.) from GET /api/v1/me. */
  me: MeRecord | null;
  isAdmin: boolean;
  /** Signed in to Firebase but the gateway won't authorize (not in the
   * allowlist). The shell shows an access-denied screen. */
  accessDenied: boolean;
  /** Sign-out is in flight — the shell renders nothing so the app never flashes
   * between clearing the session and the redirect to /login. */
  signingOut: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

// GET /me needs the httpOnly session cookie. Right after sign-in that cookie is
// minted by a separate async POST /api/auth/session that may not have landed
// yet, and it can also expire while the Firebase session is still live. On a
// 401 with a live Firebase user, (re)mint the cookie from a fresh ID token and
// retry once — turning the sign-in race into a deterministic success and only
// surfacing access-denied for a genuine allowlist denial.
async function fetchMe(u: User | null): Promise<MeRecord> {
  try {
    return await meApi.get();
  } catch (err) {
    if (!u) throw err;
    const idToken = await u.getIdToken();
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) throw err;
    return await meApi.get();
  }
}

const AuthContext = createContext<AuthState>({
  user: null,
  me: null,
  isAdmin: false,
  accessDenied: false,
  signingOut: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<MeRecord | null>(null);
  const [accessDenied, setAccessDenied] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setCurrentUserCache(u);
      setLoading(false);
      setAccessDenied(false);
      // Resolve the DB-authoritative role from /me regardless of a Firebase
      // user: local dev has no login but the gateway still returns the dev
      // admin; a logged-out prod request 403s and clears it.
      try {
        const record = await fetchMe(u);
        setMe(record);
        setCurrentUserRole(record.role as Role);
      } catch {
        setMe(null);
        // Logged in but the gateway denied (not provisioned) → access denied.
        if (u) setAccessDenied(true);
      }
    });
  }, []);

  async function signOut() {
    setSigningOut(true); // blank the shell immediately — no app flash before redirect
    await fbSignOut(auth);
    await fetch("/api/auth/session", { method: "DELETE" });
    track("logout");
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        me,
        isAdmin: me?.role === "admin",
        accessDenied,
        signingOut,
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
