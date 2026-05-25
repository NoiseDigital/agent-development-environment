'use client';

import { useState } from 'react';
import type { Dashboard } from '../../data/mock-dashboard-data';
import { canShareExternally, dashboardTitle } from '../../lib/dashboard-access';
import { showToast } from '../../lib/toast';

// A modern share dialog — people + roles + general access, in the shape users
// expect from Google Docs / Notion. Presentational for now: invites and roles
// are local state, not yet wired to auth. "Copy link" works.

type Role = 'Viewer' | 'Editor';

interface Person {
  name: string;
  email: string;
  role: Role | 'Owner';
}

const inputCls =
  'rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none';

export default function ShareDashboardModal({
  dashboard,
  onClose,
}: {
  dashboard: Dashboard;
  onClose: () => void;
}) {
  const externalShare = canShareExternally(dashboard);
  const [people, setPeople] = useState<Person[]>([
    { name: 'You', email: 'you@noisedigital.com', role: 'Owner' },
  ]);
  const [invite, setInvite] = useState('');
  const [inviteRole, setInviteRole] = useState<Role>('Viewer');
  const [access, setAccess] = useState<'restricted' | 'open'>(externalShare ? 'restricted' : 'open');

  const addPerson = () => {
    const email = invite.trim();
    if (!email || people.some((p) => p.email === email)) return;
    setPeople((prev) => [...prev, { name: email.split('@')[0], email, role: inviteRole }]);
    setInvite('');
  };

  const setRole = (email: string, role: Role) =>
    setPeople((prev) => prev.map((p) => (p.email === email ? { ...p, role } : p)));

  const removePerson = (email: string) =>
    setPeople((prev) => prev.filter((p) => p.email !== email));

  const copyLink = () => {
    navigator.clipboard?.writeText(window.location.href);
    showToast({ message: 'Link copied to clipboard.', tone: 'success' });
  };

  const openLabel = externalShare ? 'Client viewers can view' : 'Anyone at Noise with the link';
  const accessHint =
    access === 'restricted'
      ? 'Only people added above can open this dashboard.'
      : externalShare
        ? 'The client can view this report — read-only.'
        : 'Anyone at Noise with the link can view.';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <h2 className="truncate pr-3 text-sm font-semibold text-white">
            Share &ldquo;{dashboardTitle(dashboard)}&rdquo;
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 text-zinc-500 transition-colors hover:text-white"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          {/* Invite row */}
          <div className="flex gap-2">
            <input
              autoFocus
              type="email"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addPerson()}
              placeholder="Add people by email"
              className={`flex-1 ${inputCls}`}
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as Role)}
              className={inputCls}
            >
              <option value="Viewer">Viewer</option>
              <option value="Editor">Editor</option>
            </select>
            <button
              type="button"
              onClick={addPerson}
              disabled={!invite.trim()}
              className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-40"
            >
              Invite
            </button>
          </div>

          {/* People with access */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              People with access
            </p>
            <div className="space-y-1.5">
              {people.map((p) => (
                <div key={p.email} className="flex items-center gap-2.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-[10px] font-bold uppercase text-zinc-300">
                    {p.name.slice(0, 2)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs text-white">{p.name}</p>
                    <p className="truncate text-[10px] text-zinc-500">{p.email}</p>
                  </div>
                  {p.role === 'Owner' ? (
                    <span className="text-[11px] text-zinc-500">Owner</span>
                  ) : (
                    <>
                      <select
                        value={p.role}
                        onChange={(e) => setRole(p.email, e.target.value as Role)}
                        className="rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-300 focus:border-zinc-600 focus:outline-none"
                      >
                        <option value="Viewer">Viewer</option>
                        <option value="Editor">Editor</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => removePerson(p.email)}
                        className="text-zinc-600 transition-colors hover:text-zinc-300"
                        aria-label={`Remove ${p.name}`}
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* General access */}
          <div>
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              General access
            </p>
            <div className="flex items-center gap-2.5 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-zinc-400">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  {access === 'restricted' ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18" />
                  )}
                </svg>
              </span>
              <select
                value={access}
                onChange={(e) => setAccess(e.target.value as 'restricted' | 'open')}
                className="flex-1 bg-transparent text-xs text-white focus:outline-none"
              >
                <option value="restricted">Restricted</option>
                <option value="open">{openLabel}</option>
              </select>
            </div>
            <p className="mt-1.5 text-[11px] text-zinc-600">{accessHint}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-800 px-5 py-3.5">
          <button
            type="button"
            onClick={copyLink}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 010 5.656l-3 3a4 4 0 01-5.656-5.656l1.5-1.5m6.656-1.328a4 4 0 010-5.656l3-3a4 4 0 015.656 5.656l-1.5 1.5" />
            </svg>
            Copy link
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-white px-4 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-zinc-200"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
