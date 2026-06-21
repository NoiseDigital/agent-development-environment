"use client";

import { Suspense, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import {
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import { auth, googleProvider } from "@/lib/firebase/client";
import { track } from "@/lib/analytics/track";
import { branding } from "@/config/tenant";

// Exchange a freshly-signed-in user for an httpOnly session cookie, then go to
// the originally-requested page. Surfaces the server's reason (e.g. a domain
// that isn't permitted) so the user sees why access was denied.
async function startSession(idToken: string): Promise<void> {
  const res = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error || "Could not start session.");
  }
}

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function complete(idToken: string, method: "google" | "email") {
    await startSession(idToken);
    track("login", { method });
    router.replace(next);
  }

  async function onEmailPassword(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      await complete(await cred.user.getIdToken(), "email");
    } catch (e) {
      // A denied session leaves the client signed-in; sign back out so a retry
      // is clean and no half-authenticated state lingers.
      await signOut(auth).catch(() => {});
      setError(
        e instanceof Error && e.message.includes("permitted")
          ? e.message
          : "Sign-in failed. Check your email and password.",
      );
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await complete(await cred.user.getIdToken(), "google");
    } catch (e) {
      await signOut(auth).catch(() => {});
      setError(
        e instanceof Error && e.message.includes("permitted")
          ? e.message
          : "Google sign-in failed.",
      );
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm rounded-2xl border border-line bg-surface p-8 shadow-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <Image
            src={branding.logo}
            alt={branding.brandName}
            width={120}
            height={32}
            className={`mb-3 h-8 w-auto${branding.logoInvertOnLight ? " light:invert" : ""}`}
          />
          <p className="text-sm text-foreground/60">Sign in to continue.</p>
        </div>

        <button
          onClick={onGoogle}
          disabled={busy}
          className="mb-4 flex w-full items-center justify-center gap-2 rounded-lg border border-line bg-canvas px-4 py-2.5 text-sm font-medium text-foreground transition hover:bg-surface-sunken disabled:opacity-50"
        >
          Continue with Google
        </button>

        <div className="my-4 flex items-center gap-3 text-xs text-foreground/40">
          <span className="h-px flex-1 bg-line" />
          or
          <span className="h-px flex-1 bg-line" />
        </div>

        <form onSubmit={onEmailPassword} className="space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder={`you@${branding.emailDomain}`}
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-foreground outline-none focus:border-foreground/30"
          />
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-line bg-canvas px-3 py-2.5 text-sm text-foreground outline-none focus:border-foreground/30"
          />
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-canvas transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>

        {error && <p className="mt-4 text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}

export default function LoginPage() {
  // useSearchParams requires a Suspense boundary.
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
