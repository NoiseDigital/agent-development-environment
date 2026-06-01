'use client';

import { useState } from 'react';
import type { Dashboard } from '../../data/dashboards';
import { saveIssueReport, type IssueArea } from '../../lib/issue-reports';
import { dashboardTitle } from '../../lib/dashboards/access';
import { showToast } from '../../lib/toast';

// "Flag an issue" — a user reports a problem with a dashboard (wrong data, a
// broken visual, a layout glitch). Goes to the issue queue for review.

const AREAS: { value: IssueArea; label: string }[] = [
  { value: 'data', label: 'The data looks wrong' },
  { value: 'visual', label: 'A chart or visual is broken' },
  { value: 'layout', label: 'Layout or formatting problem' },
  { value: 'other', label: 'Something else' },
];

const inputCls =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none';

export default function FlagIssueModal({
  dashboard,
  onClose,
}: {
  dashboard: Dashboard;
  onClose: () => void;
}) {
  const [area, setArea] = useState<IssueArea>('data');
  const [notes, setNotes] = useState('');

  const submit = () => {
    if (!notes.trim()) return;
    saveIssueReport({
      dashboardId: dashboard.id,
      dashboardName: dashboardTitle(dashboard),
      area,
      notes: notes.trim(),
    });
    showToast({ message: 'Issue flagged — thanks, the team will take a look.', tone: 'success' });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-white">Flag an issue</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-zinc-500 transition-colors hover:text-white"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs leading-relaxed text-zinc-400">
            Report a problem with{' '}
            <span className="font-medium text-white">{dashboardTitle(dashboard)}</span>. It goes to
            the team&apos;s review queue.
          </p>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              What kind of issue?
            </label>
            <select value={area} onChange={(e) => setArea(e.target.value as IssueArea)} className={inputCls}>
              {AREAS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Details
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="What's wrong, and where? Which tile or number, what you expected…"
              className={`resize-none ${inputCls}`}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-800 px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-zinc-800 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!notes.trim()}
            className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-zinc-200 disabled:opacity-40"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
