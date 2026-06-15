"use client";

import { useEffect, useState } from "react";

import { meApi, type MeRecord } from "@/lib/api/me";
import { useAuth } from "@/lib/firebase/auth-context";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line px-4 py-3 last:border-b-0">
      <span className="text-[13px] text-subtle">{label}</span>
      <span className="min-w-0 truncate text-right text-[13px] text-foreground">
        {children}
      </span>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = {
  admin: "Admin",
  member: "Member",
  viewer: "Viewer",
};

export default function AccountSettingsPage() {
  const { user, signOut } = useAuth();
  const [me, setMe] = useState<MeRecord | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    meApi
      .get()
      .then(setMe)
      .catch(() => setError("Couldn't load your account details."));
  }, []);

  const email = me?.email ?? user?.email ?? "—";
  const role = me?.role ?? "member";

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Account</h1>
        <p className="mb-6 text-[13px] text-subtle">
          Your profile and access tier.
        </p>

        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <Row label="Email">{email}</Row>
          <Row label="User ID">
            <span className="font-mono text-[12px]">{me?.uid ?? "—"}</span>
          </Row>
          <Row label="Role">
            <span className="inline-flex items-center rounded-full bg-surface-raised px-2.5 py-0.5 text-[12px] font-medium capitalize text-foreground">
              {ROLE_LABEL[role] ?? role}
            </span>
          </Row>
        </div>

        {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}

        <button
          type="button"
          onClick={() => signOut()}
          className="mt-6 rounded-lg border border-line px-4 py-2 text-[13px] font-medium text-subtle transition hover:bg-surface hover:text-foreground"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
