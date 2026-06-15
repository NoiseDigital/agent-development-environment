"use client";

// Admin-only user management: invite by email, set roles, activate/deactivate,
// remove. Mirrors the gateway's /api/v1/users (require_role("admin")). The UI
// gate is presentation; the gateway is the real authority.

import { useEffect, useMemo, useState } from "react";

import { usersApi, type Role, type UserRecord } from "@/lib/api/users";
import { useAuth } from "@/lib/firebase/auth-context";

const ROLES: Role[] = ["admin", "member", "viewer"];

export default function UsersAdminPage() {
  const { me, isAdmin, loading } = useAuth();
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("member");

  const myUid = me?.uid ?? null;
  const sorted = useMemo(
    () => [...users].sort((a, b) => a.email.localeCompare(b.email)),
    [users],
  );

  async function refresh() {
    try {
      setUsers(await usersApi.list());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load users.");
    }
  }

  useEffect(() => {
    if (isAdmin) refresh();
  }, [isAdmin]);

  async function run<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    await run(() => usersApi.invite(email.trim(), role));
    setEmail("");
    setRole("member");
  }

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-1 text-xl font-semibold text-foreground">Users</h1>
          <p className="text-[13px] text-subtle">
            You need an admin role to manage users.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Users</h1>
        <p className="mb-6 text-[13px] text-subtle">
          Invite people by email and set their access. Only invited, active
          users can sign in.
        </p>

        {/* Invite */}
        <form
          onSubmit={invite}
          className="mb-6 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3"
        >
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@noisedigital.com"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-raised px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-subtle focus:border-subtle"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className="rounded-lg border border-line bg-surface-raised px-3 py-2 text-[13px] capitalize text-foreground outline-none"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-foreground px-4 py-2 text-[13px] font-medium text-background transition hover:opacity-90 disabled:opacity-50"
          >
            Invite
          </button>
        </form>

        {error && <p className="mb-3 text-[13px] text-red-500">{error}</p>}

        {/* Directory */}
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          <div className="grid grid-cols-[1fr_120px_110px_90px] items-center gap-2 border-b border-line px-4 py-2 text-[11px] font-medium uppercase tracking-wide text-subtle">
            <span>User</span>
            <span>Role</span>
            <span>Status</span>
            <span className="text-right">Actions</span>
          </div>
          {sorted.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-subtle">
              No users yet.
            </p>
          )}
          {sorted.map((u) => {
            const self = !!myUid && u.uid === myUid;
            return (
              <div
                key={u.id}
                className="grid grid-cols-[1fr_120px_110px_90px] items-center gap-2 border-b border-line px-4 py-3 last:border-b-0"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] text-foreground">
                    {u.email}
                    {self && (
                      <span className="ml-2 text-[11px] text-subtle">(you)</span>
                    )}
                  </div>
                  <div className="text-[11px] text-subtle">
                    {u.uid ? "Active sign-in" : "Invited — not signed in yet"}
                  </div>
                </div>

                <select
                  value={u.role}
                  disabled={busy || self}
                  onChange={(e) =>
                    run(() =>
                      usersApi.update(u.id, { role: e.target.value as Role }),
                    )
                  }
                  className="rounded-lg border border-line bg-surface-raised px-2 py-1.5 text-[12px] capitalize text-foreground outline-none disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>

                <span
                  className={`inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-[12px] font-medium ${
                    u.is_active
                      ? "bg-surface-raised text-foreground"
                      : "bg-surface-raised text-subtle"
                  }`}
                >
                  {u.is_active ? "Active" : "Disabled"}
                </span>

                <div className="flex items-center justify-end gap-2">
                  {!self && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            usersApi.update(u.id, { is_active: !u.is_active }),
                          )
                        }
                        title={u.is_active ? "Disable access" : "Enable access"}
                        className="text-[12px] text-subtle transition hover:text-foreground disabled:opacity-50"
                      >
                        {u.is_active ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => usersApi.remove(u.id))}
                        title="Remove user"
                        className="text-[12px] text-red-500 transition hover:text-red-400 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
