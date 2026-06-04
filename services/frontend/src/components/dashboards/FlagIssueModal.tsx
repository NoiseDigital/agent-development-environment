'use client';

import { useState } from 'react';
import type { Dashboard } from '../../data/dashboards';
import { saveIssueReport, type IssueArea } from '../../lib/api/issue-reports';
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
  'w-full rounded-lg border border-line bg-surface-sunken px-3 py-2 text-xs text-foreground placeholder-disabled transition-colors focus:border-line-strong focus:outline-none';

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
        className="w-full max-w-md rounded-xl border border-line bg-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-foreground">Flag an issue</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-faint transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <p className="text-xs leading-relaxed text-subtle">
            Report a problem with{' '}
            <span className="font-medium text-foreground">{dashboardTitle(dashboard)}</span>. It goes to
            the team&apos;s review queue.
          </p>

          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-faint">
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
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-faint">
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

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-line px-3 py-1.5 text-[11px] font-medium text-subtle transition-colors hover:border-line-strong hover:text-foreground"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!notes.trim()}
            className="rounded-lg bg-inverse px-3 py-1.5 text-[11px] font-semibold text-inverse-foreground transition-colors hover:bg-inverse/90 disabled:opacity-40"
          >
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}
