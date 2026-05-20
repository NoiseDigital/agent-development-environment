'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toPng } from 'html-to-image';
import { mockDashboards } from '../data/mock-dashboard-data';
import { addChartToDashboard } from '../lib/dashboard-store';
import { ChartData } from '../types/chart';

interface ChartActionsProps {
  chart: ChartData;
  /** The chart card node — captured for PNG export. */
  captureRef: React.RefObject<HTMLDivElement | null>;
}

function slug(s?: string): string {
  return (s || 'chart').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function triggerDownload(filename: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

// Flatten a chart's underlying data to CSV — series rows, or a heatmap matrix.
function chartToCsv(chart: ChartData): string {
  if (chart.type === 'heatmap' && chart.rows && chart.cols && chart.matrix) {
    const header = ['', ...chart.cols].join(',');
    const body = chart.rows.map((r, i) =>
      [r, ...(chart.matrix![i] ?? []).map((v) => (v ?? ''))].join(','),
    );
    return [header, ...body].join('\n');
  }
  const data = chart.data ?? [];
  if (data.length === 0) return '';
  const keys = Object.keys(data[0]);
  const cell = (v: unknown) =>
    typeof v === 'string' && /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v ?? '';
  return [
    keys.join(','),
    ...data.map((row) => keys.map((k) => cell(row[k])).join(',')),
  ].join('\n');
}

// "+" menu on chat / Analyze visuals: save to a dashboard, export PNG, export CSV.
export default function ChartActions({ chart, captureRef }: ChartActionsProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'dashboards'>('menu');
  const [savedTo, setSavedTo] = useState<{ id: string; name: string } | null>(null);

  const close = () => {
    setOpen(false);
    setView('menu');
  };

  const handlePng = async () => {
    close();
    const node = captureRef.current;
    if (!node) return;
    try {
      const dataUrl = await toPng(node, {
        pixelRatio: 2,
        backgroundColor: '#18181b',
        filter: (n) => !(n instanceof HTMLElement && n.dataset.noExport === 'true'),
      });
      triggerDownload(`${slug(chart.title)}.png`, dataUrl);
    } catch (e) {
      console.error('PNG export failed', e);
    }
  };

  const handleCsv = () => {
    close();
    const blob = new Blob([chartToCsv(chart)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    triggerDownload(`${slug(chart.title)}.csv`, url);
    URL.revokeObjectURL(url);
  };

  const handleSaveToDashboard = (id: string) => {
    const dashboard = mockDashboards.find((d) => d.id === id);
    if (!dashboard) return;
    addChartToDashboard(dashboard, chart);
    close();
    setSavedTo({ id: dashboard.id, name: dashboard.name });
    window.setTimeout(() => setSavedTo(null), 6000);
  };

  if (savedTo) {
    return (
      <Link
        href={`/dashboards?id=${savedTo.id}`}
        title={`Open ${savedTo.name}`}
        className="group/saved flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 hover:text-emerald-300 transition-colors"
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
    <div className="relative" data-no-export="true">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Chart actions"
        className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl py-1">
            {view === 'menu' ? (
              <>
                <MenuItem
                  label="Save to dashboard"
                  chevron
                  onClick={() => setView('dashboards')}
                  icon="M9 17V7m6 10v-4M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"
                />
                <MenuItem
                  label="Save as PNG"
                  onClick={handlePng}
                  icon="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM10 9a1 1 0 11-2 0 1 1 0 012 0z"
                />
                <MenuItem
                  label="Export raw data"
                  onClick={handleCsv}
                  icon="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setView('menu')}
                  className="flex items-center gap-1.5 w-full px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                  </svg>
                  Add to dashboard
                </button>
                {mockDashboards.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => handleSaveToDashboard(d.id)}
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
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({
  label, icon, onClick, chevron,
}: {
  label: string; icon: string; onClick: () => void; chevron?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 w-full px-3 py-2 text-left text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors"
    >
      <svg className="w-3.5 h-3.5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
      <span className="flex-1">{label}</span>
      {chevron && (
        <svg className="w-3 h-3 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
}
