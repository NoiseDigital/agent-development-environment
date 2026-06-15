// Renders the app shell (sidebar, assistant, background) for every route except
// /login, which gets a bare full-screen canvas. Keeps the shell out of the
// unauthenticated login view without a route-group restructure.
"use client";

import { usePathname } from "next/navigation";

import PlatformSidebar from "./PlatformSidebar";
import FloatingAssistant from "./chat/FloatingAssistant";
import NeuralBackground from "./NeuralBackground";
import Toaster from "./ui/Toaster";

export default function AppChrome({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname === "/login") {
    return (
      <>
        {children}
        <Toaster />
      </>
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
