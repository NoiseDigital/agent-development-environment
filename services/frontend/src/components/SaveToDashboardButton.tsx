'use client';

import { useState } from 'react';
import Link from 'next/link';
import { mockDashboards } from '../data/mockDashboardData';
import { addChartToDashboard } from '../lib/dashboardStore';
import { ChartData } from '../types/chart';

// Lets the user save a chat-generated visual into one of the existing dashboards.
// Persistence is mocked through localStorage (see dashboardStore).
export default function SaveToDashboardButton({ chart }: { chart: ChartData }) {
  const [open, setOpen] = useState(false);
  const [savedTo, setSavedTo] = useState<{ id: string; name: string } | null>(null);

  const handleSave = (dashboardId: string) => {
    const dashboard = mockDashboards.find((d) => d.id === dashboardId);
    if (!dashboard) return;
    addChartToDashboard(dashboard, chart);
    setOpen(false);
    setSavedTo({ id: dashboard.id, name: dashboard.name });
    window.setTimeout(() => setSavedTo(null), 6000);
  };

  if (savedTo) {
    return (
      <Link
        href={`/dashboards?id=${savedTo.id}`}
        className="group/saved flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
        title={`Open ${savedTo.name}`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="group-hover/saved:underline">Saved to {savedTo.name}</span>
        <svg className="w-3 h-3 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-medium text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-md transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Save to dashboard
      </button>

      {open && (
        <>
          {/* click-outside backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1">
            <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-600">
              Add to dashboard
            </p>
            {mockDashboards.map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => handleSave(d.id)}
                className="flex items-center gap-2.5 w-full px-3 py-2 text-left hover:bg-zinc-800 transition-colors"
              >
                <span className="w-6 h-6 rounded bg-zinc-800 border border-zinc-700 flex items-center justify-center text-[9px] font-bold text-zinc-300 shrink-0">
                  {d.clientInitials}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-xs text-white truncate">{d.name}</span>
                  <span className="block text-[10px] text-zinc-500 truncate">{d.client}</span>
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
