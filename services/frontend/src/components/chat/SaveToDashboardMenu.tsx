'use client';

// Dropdown picker that lets the user save a chat-generated chart to any of
// their personal dashboards — or spin up a new personal report on the fly.
// Used by ChartBlock when the chat is rendering OUTSIDE a dashboard
// edit-mode context. Inside that context, ChartBlock keeps the existing
// one-click "Save to <current tab>" path because the target is implied.
//
// Matches the existing user-dashboard hierarchy:
//   user dashboards (localStorage today) → tabs → pinned charts
// "Create new personal report" mirrors the `saveUserDashboard` shape
// `NewDashboardModal` writes, then pins the spec to the new dashboard's
// overall tab so the user lands on a populated report.

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { VegaSpec } from '../../types/genui';
import {
  loadUserDashboards,
  saveUserDashboard,
  type UserDashboardSpec,
} from '../../lib/user-dashboards';
import { pinsApi } from '../../lib/pins-api';
import { newId } from '../../lib/id';
import { showToast } from '../../lib/toast';
import { clientBySlug } from '../../data/clients';

type SaveState = 'idle' | 'saving' | 'saved';

interface PickerProps {
  spec: VegaSpec;
  /** Default tab to pin into on user dashboards. Every code-defined and
   *  user dashboard exposes an `overall` tab, so this is the safe default. */
  defaultTabId?: string;
}

export default function SaveToDashboardMenu({ spec, defaultTabId = 'overall' }: PickerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<SaveState>('idle');
  const [savedLabel, setSavedLabel] = useState<string | null>(null);
  const [dashboards, setDashboards] = useState<UserDashboardSpec[]>([]);
  // Inline "create new" form state — opens within the dropdown instead of
  // a separate modal so the chat flow stays single-surface.
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  // Re-read user dashboards every time the menu opens — covers the case
  // where the user created a new dashboard in another tab since this chat
  // surface mounted.
  useEffect(() => {
    if (open) setDashboards(loadUserDashboards());
  }, [open]);

  // Close on outside click. We listen on `pointerdown` so the close fires
  // before any nested click handler outside the dropdown.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    window.addEventListener('pointerdown', onDown);
    return () => window.removeEventListener('pointerdown', onDown);
  }, [open]);

  const pinToExisting = async (d: UserDashboardSpec) => {
    if (state !== 'idle') return;
    setState('saving');
    try {
      await pinsApi.create(d.id, defaultTabId, spec);
      setState('saved');
      setSavedLabel(d.name);
      setOpen(false);
      showToast({
        message: `Saved to "${d.name}"`,
        tone: 'success',
        action: { label: 'Open', onClick: () => router.push(`/dashboards/${d.id}`) },
      });
    } catch (err) {
      // Surface the failure both in the toast and in console (not a silent
      // catch — the user needs to know the save didn't persist).
      console.warn('[SaveToDashboardMenu] pin failed for', d.id, err);
      showToast({ message: `Couldn't save to "${d.name}". Try again.`, tone: 'error' });
      setState('idle');
    }
  };

  const createAndPin = async () => {
    if (state !== 'idle') return;
    const name = newName.trim() || defaultName();
    const id = newId();
    setState('saving');
    try {
      saveUserDashboard({
        id,
        name,
        // Personal reports default to the full client dataset; users can
        // narrow via the report's own filter bar after creation. Same default
        // NewDashboardModal uses when no campaign is selected.
        campaignId: 'all',
        defaultTabId,
        createdAt: new Date().toISOString(),
      });
      await pinsApi.create(id, defaultTabId, spec);
      setState('saved');
      setSavedLabel(name);
      setOpen(false);
      setCreating(false);
      setNewName('');
      showToast({
        message: `Created "${name}" and pinned the chart.`,
        tone: 'success',
        action: { label: 'Open', onClick: () => router.push(`/dashboards/${id}`) },
      });
    } catch (err) {
      console.warn('[SaveToDashboardMenu] create + pin failed', err);
      showToast({ message: 'Could not create the report. Try again.', tone: 'error' });
      setState('idle');
    }
  };

  // After a successful save we keep the button in its "saved" state so the
  // user doesn't double-save accidentally. A separate "Save again" reset
  // lets them pick a different target if they want.
  if (state === 'saved' && savedLabel) {
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
          <CheckIcon /> Saved to {savedLabel}
        </span>
        <button
          type="button"
          onClick={() => {
            setState('idle');
            setSavedLabel(null);
          }}
          className="text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
        >
          Save again
        </button>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={state === 'saving'}
        title="Save this chart to a dashboard"
        className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
      >
        <BookmarkIcon />
        {state === 'saving' ? 'Saving…' : 'Save to dashboard'}
        <ChevronIcon open={open} />
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-1.5 w-64 rounded-lg border border-zinc-800 bg-zinc-950 shadow-[0_12px_30px_rgba(0,0,0,0.5)]">
          {dashboards.length > 0 ? (
            <>
              <p className="px-3 pt-2.5 text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                Your reports
              </p>
              <ul className="max-h-64 overflow-y-auto py-1">
                {dashboards.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => pinToExisting(d)}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-xs text-zinc-200 transition-colors hover:bg-zinc-900"
                    >
                      <span className="truncate">{d.name}</span>
                      <span className="shrink-0 text-[10px] text-zinc-500">
                        {clientBySlug(d.campaignId === 'all' ? 'noi' : d.campaignId).initials}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="px-3 py-3 text-[11px] text-zinc-500">
              No personal reports yet — create your first below.
            </p>
          )}

          <div className="border-t border-zinc-800/60 p-2">
            {creating ? (
              <div className="space-y-1.5">
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') createAndPin();
                    if (e.key === 'Escape') {
                      setCreating(false);
                      setNewName('');
                    }
                  }}
                  placeholder={defaultName()}
                  className="w-full rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-[11px] text-white placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                />
                <div className="flex items-center justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCreating(false);
                      setNewName('');
                    }}
                    className="px-2 py-1 text-[11px] text-zinc-500 transition-colors hover:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={createAndPin}
                    className="rounded-md bg-white px-2 py-1 text-[11px] font-semibold text-black transition-colors hover:bg-zinc-200"
                  >
                    Create + pin
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:bg-zinc-900 hover:text-white"
              >
                <PlusIcon /> Create new personal report
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** Default name for a new personal report. Keep it short and timestamped so
 *  rapid-fire saves don't all collapse into one identical name. */
function defaultName(): string {
  const d = new Date();
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `Personal Report — ${month} ${d.getDate()}`;
}

// ── Icons ──────────────────────────────────────────────────────────────

function BookmarkIcon() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
    </svg>
  );
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
    </svg>
  );
}
