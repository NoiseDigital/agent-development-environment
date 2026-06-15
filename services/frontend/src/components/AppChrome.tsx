// Renders the app shell (sidebar, assistant, background) for every route except
// /login, which gets a bare full-screen canvas. Keeps the shell out of the
// unauthenticated login view without a route-group restructure.
"use client";

import { usePathname } from "next/navigation";

import PlatformSidebar from "./PlatformSidebar";
import FloatingAssistant from "./chat/FloatingAssistant";
import NeuralBackground from "./NeuralBackground";
import Toaster from "./ui/Toaster";
import { useAuth } from "@/lib/firebase/auth-context";

export default function AppChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { accessDenied, signingOut, user, signOut } = useAuth();

  if (pathname === "/login") {
    return (
      <>
        {children}
        <Toaster />
      </>
    );
  }

  // Sign-out in flight — render nothing so the app never flashes between
  // clearing the session and the redirect to /login.
  if (signingOut) return null;

  // Authenticated to Firebase but not in the gateway's allowlist.
  if (accessDenied) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground">
          Access not provisioned
        </h1>
        <p className="max-w-md text-[13px] text-subtle">
          {user?.email ? `${user.email} isn't` : "Your account isn't"} on the
          access list yet. Ask an admin to add you, then sign in again.
        </p>
        <button
          type="button"
          onClick={() => signOut()}
          className="mt-2 rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-subtle transition hover:bg-surface hover:text-foreground"
        >
          Sign out
        </button>
        <Toaster />
      </div>
    );
  }

  return (
    <>
      <NeuralBackground />
      <div className="relative z-10 flex h-screen overflow-hidden">
        <PlatformSidebar />
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col">
          {children}
        </div>
      </div>
      <FloatingAssistant />
      <Toaster />
    </>
  );
}
