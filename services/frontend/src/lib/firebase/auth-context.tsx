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

interface AuthState {
  user: User | null;
  /** DB-authoritative directory record (role, etc.) from GET /api/v1/me. */
  me: MeRecord | null;
  isAdmin: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  me: null,
  isAdmin: false,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [me, setMe] = useState<MeRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setCurrentUserCache(u);
      setLoading(false);
      if (!u) {
        setMe(null);
        return;
      }
      // Resolve the DB-authoritative role/identity, then sync the sync seam.
      try {
        const record = await meApi.get();
        setMe(record);
        setCurrentUserRole(record.role as Role);
      } catch {
        setMe(null); // un-provisioned / error → no elevated access
      }
    });
  }, []);

  async function signOut() {
    await fbSignOut(auth);
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider
      value={{ user, me, isAdmin: me?.role === "admin", loading, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
