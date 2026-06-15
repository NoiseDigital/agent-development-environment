// Account button for the sidebar footer: shows the signed-in user and opens a
// popup with Account settings + Sign out.
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/firebase/auth-context";

export default function UserMenu() {
  const { user, isAdmin, signOut } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickAway(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickAway);
    return () => document.removeEventListener("mousedown", onClickAway);
  }, []);

  const email = user?.email ?? "Signed in";
  const initials = (user?.email?.[0] ?? "U").toUpperCase();

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={email}
        aria-label="Account"
        className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors duration-150 hover:bg-surface hover:text-foreground"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface-raised text-[11px] font-semibold text-foreground">
          {initials}
        </span>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-52 overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-lg">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              router.push("/settings/account");
            }}
            className="block w-full px-3 py-2 text-left text-[12.5px] text-subtle transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            Account settings
          </button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/settings/users");
              }}
              className="block w-full px-3 py-2 text-left text-[12.5px] text-subtle transition-colors hover:bg-surface-raised hover:text-foreground"
            >
              Access &amp; users
            </button>
          )}
          <button
            type="button"
            onClick={() => signOut()}
            className="block w-full px-3 py-2 text-left text-[12.5px] text-subtle transition-colors hover:bg-surface-raised hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
