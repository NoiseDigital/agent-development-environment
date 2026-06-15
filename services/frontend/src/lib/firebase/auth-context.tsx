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
import { setCurrentUserCache } from "@/lib/auth";

interface AuthState {
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u);
      setCurrentUserCache(u);
      setLoading(false);
    });
  }, []);

  async function signOut() {
    await fbSignOut(auth);
    await fetch("/api/auth/session", { method: "DELETE" });
    window.location.href = "/login";
  }

  return (
    <AuthContext.Provider value={{ user, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
