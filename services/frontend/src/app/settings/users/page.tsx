"use client";

// Admin-only Access management:
//   • Access rules — the allowlist. Add an email (jane@x.com) or a whole domain
//     (@x.com) with a default role. The gateway authorizes first sign-in from
//     these (exact email beats domain) and JIT-creates the user.
//   • Users — people who've actually signed in; override a role or disable them.
// The UI gate is presentation; the gateway is the authority.

import { useEffect, useMemo, useState } from "react";

import { accessApi, type AccessRule, type Role } from "@/lib/api/access";
import { usersApi, type UserRecord } from "@/lib/api/users";
import { useAuth } from "@/lib/firebase/auth-context";
import { track } from "@/lib/analytics/track";

const ROLES: Role[] = ["admin", "member", "viewer"];

function RoleSelect({
  value,
  disabled,
  onChange,
}: {
  value: Role;
  disabled?: boolean;
  onChange: (r: Role) => void;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Role)}
      className="rounded-lg border border-line bg-surface-raised px-2 py-1.5 text-[12px] capitalize text-foreground outline-none disabled:opacity-50"
    >
      {ROLES.map((r) => (
        <option key={r} value={r}>
          {r}
        </option>
      ))}
    </select>
  );
}

function StatusPill({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-full bg-surface-raised px-2.5 py-0.5 text-[12px] font-medium ${
        active ? "text-foreground" : "text-subtle"
      }`}
    >
      {active ? "Active" : "Disabled"}
    </span>
  );
}

export default function AccessPage() {
  const { me, isAdmin, loading } = useAuth();
  const [rules, setRules] = useState<AccessRule[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [pattern, setPattern] = useState("");
  const [role, setRole] = useState<Role>("member");

  const myUid = me?.uid ?? null;
  const sortedUsers = useMemo(
    () => [...users].sort((a, b) => a.email.localeCompare(b.email)),
    [users],
  );

  async function refresh() {
    try {
      const [r, u] = await Promise.all([accessApi.list(), usersApi.list()]);
      setRules(r);
      setUsers(u);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load access settings.");
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

  async function addRule(e: React.FormEvent) {
    e.preventDefault();
    if (!pattern.trim()) return;
    await run(async () => {
      await accessApi.add(pattern.trim(), role);
      track("user_invited", { role });
    });
    setPattern("");
    setRole("member");
  }

  if (loading) return null;

  if (!isAdmin) {
    return (
      <div className="flex-1 overflow-y-auto p-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="mb-1 text-xl font-semibold text-foreground">Access</h1>
          <p className="text-[13px] text-subtle">
            You need an admin role to manage access.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mx-auto max-w-3xl">
        <h1 className="mb-1 text-xl font-semibold text-foreground">Access</h1>
        <p className="mb-6 text-[13px] text-subtle">
          Allow people by email or whole domain, and manage who&apos;s signed in.
          Only allowed, active users can use the platform.
        </p>

        {error && <p className="mb-3 text-[13px] text-red-500">{error}</p>}

        {/* ── Access rules (the allowlist) ─────────────────────────────── */}
        <h2 className="mb-2 text-[13px] font-semibold text-foreground">
          Access rules
        </h2>
        <form
          onSubmit={addRule}
          className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface p-3"
        >
          <input
            value={pattern}
            onChange={(e) => setPattern(e.target.value)}
            placeholder="name@example.com  or  @example.com"
            className="min-w-0 flex-1 rounded-lg border border-line bg-surface-raised px-3 py-2 text-[13px] text-foreground outline-none placeholder:text-subtle focus:border-subtle"
          />
          <RoleSelect value={role} onChange={setRole} />
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-foreground px-4 py-2 text-[13px] font-medium text-canvas transition hover:opacity-90 disabled:opacity-50"
          >
            Add
          </button>
        </form>

        <div className="mb-8 overflow-hidden rounded-xl border border-line bg-surface">
          {rules.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-subtle">
              No rules yet — add an email or a domain above.
            </p>
          )}
          {rules.map((r) => (
            <div
              key={r.id}
              className="grid grid-cols-[1fr_120px_110px_90px] items-center gap-2 border-b border-line px-4 py-3 last:border-b-0"
            >
              <div className="min-w-0">
                <span className="truncate font-mono text-[13px] text-foreground">
                  {r.pattern}
                </span>
                <span className="ml-2 text-[11px] uppercase tracking-wide text-subtle">
                  {r.kind}
                </span>
              </div>
              <RoleSelect
                value={r.role}
                disabled={busy}
                onChange={(role) =>
                  run(async () => {
                    await accessApi.update(r.id, { role });
                    track("role_changed", { target: "rule", role });
                  })
                }
              />
              <StatusPill active={r.is_active} />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    run(() => accessApi.update(r.id, { is_active: !r.is_active }))
                  }
                  className="text-[12px] text-subtle transition hover:text-foreground disabled:opacity-50"
                >
                  {r.is_active ? "Disable" : "Enable"}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(() => accessApi.remove(r.id))}
                  className="text-[12px] text-red-500 transition hover:text-red-400 disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* ── Users (signed-in directory) ──────────────────────────────── */}
        <h2 className="mb-2 text-[13px] font-semibold text-foreground">Users</h2>
        <div className="overflow-hidden rounded-xl border border-line bg-surface">
          {sortedUsers.length === 0 && (
            <p className="px-4 py-6 text-center text-[13px] text-subtle">
              No one has signed in yet.
            </p>
          )}
          {sortedUsers.map((u) => {
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
                </div>
                <RoleSelect
                  value={u.role}
                  disabled={busy || self}
                  onChange={(role) =>
                    run(async () => {
                      await usersApi.update(u.id, { role });
                      track("role_changed", { target: "user", role });
                    })
                  }
                />
                <StatusPill active={u.is_active} />
                <div className="flex items-center justify-end gap-2">
                  {self ? (
                    <span className="text-[12px] text-faint">—</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(() =>
                            usersApi.update(u.id, { is_active: !u.is_active }),
                          )
                        }
                        className="text-[12px] text-subtle transition hover:text-foreground disabled:opacity-50"
                      >
                        {u.is_active ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => run(() => usersApi.remove(u.id))}
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
