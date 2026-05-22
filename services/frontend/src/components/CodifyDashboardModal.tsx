'use client';

import { useState } from 'react';
import { mockDashboards, type Dashboard } from '../data/mock-dashboard-data';
import { saveCodificationRequest, type CodifyTarget } from '../lib/codification-requests';
import { isClientDashboard } from '../lib/dashboard-access';
import { showToast } from '../lib/toast';

// "Submit for codification" — a media-team user hands an internal dashboard to
// engineering to be made permanent: codified into a client dashboard or kept as
// a reusable tile. The prototype stays editable; the codified result is code.

const TARGETS: { value: CodifyTarget; label: string; hint: string }[] = [
  {
    value: 'new-client',
    label: 'Codify as a new client dashboard',
    hint: 'Engineering builds this into a new shareable, code-defined client report.',
  },
  {
    value: 'existing-client',
    label: 'Integrate into an existing client dashboard',
    hint: 'Fold these visuals into a client dashboard that already ships.',
  },
  {
    value: 'reusable-tile',
    label: 'Add as a reusable tile / visual',
    hint: 'Make this a tile any dashboard can drop in.',
  },
];

const inputCls =
  'w-full rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none';

export default function CodifyDashboardModal({
  dashboard,
  onClose,
}: {
  dashboard: Dashboard;
  onClose: () => void;
}) {
  const clientDashboards = mockDashboards.filter(isClientDashboard);
  const [target, setTarget] = useState<CodifyTarget>('new-client');
  const [targetDashboardId, setTargetDashboardId] = useState(clientDashboards[0]?.id ?? '');
  const [notes, setNotes] = useState('');

  const activeTarget = TARGETS.find((t) => t.value === target);

  const submit = () => {
    if (!notes.trim()) return;
    saveCodificationRequest({
      dashboardId: dashboard.id,
      dashboardName: dashboard.name,
      target,
      targetDashboardId: target === 'existing-client' ? targetDashboardId : undefined,
      notes: notes.trim(),
    });
    showToast({
      message: 'Submitted for codification — engineering will review it.',
      tone: 'success',
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-3.5">
          <h2 className="text-sm font-semibold text-white">Submit for codification</h2>
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
            Hand <span className="font-medium text-white">{dashboard.name}</span> to engineering to be
            codified into the platform. Your prototype stays editable — the codified version ships as
            stable, version-controlled code.
          </p>

          {/* Target */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              What should happen with it?
            </label>
            <select
              value={target}
              onChange={(e) => setTarget(e.target.value as CodifyTarget)}
              className={inputCls}
            >
              {TARGETS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            {activeTarget && <p className="mt-1.5 text-[11px] text-zinc-600">{activeTarget.hint}</p>}
          </div>

          {/* Existing-client target picker */}
          {target === 'existing-client' && (
            <div>
              <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
                Target client dashboard
              </label>
              <select
                value={targetDashboardId}
                onChange={(e) => setTargetDashboardId(e.target.value)}
                className={inputCls}
              >
                {clientDashboards.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.client}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-zinc-500">
              Notes for engineering
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Where and how should this be integrated? Which tiles matter, any data or layout notes…"
              className={`resize-none ${inputCls}`}
            />
          </div>
        </div>

        {/* Footer */}
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
            Submit request
          </button>
        </div>
      </div>
    </div>
  );
}
