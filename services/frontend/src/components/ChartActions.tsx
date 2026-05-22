'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toPng } from 'html-to-image';
import { mockDashboards, dashboardFromSpec, type Dashboard } from '../data/mock-dashboard-data';
import { loadUserDashboards } from '../lib/user-dashboards';
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

// A client dashboard is titled by the client; internal ones by their name.
const dashTitle = (d: Dashboard) => (d.ownership === 'client' ? d.client : d.name);

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

// "+" menu on chat / Analyze visuals: save to a dashboard, export PNG, export
// CSV. Saving is a two-step pick — a dashboard, then which of its tabs — since
// a dashboard's tiles live on tabs.
export default function ChartActions({ chart, captureRef }: ChartActionsProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'dashboards' | 'tabs'>('menu');
  const [picked, setPicked] = useState<Dashboard | null>(null);
  const [savedTo, setSavedTo] = useState<{ id: string; name: string; tab: string } | null>(null);

  // User-created dashboards are pinnable too — loaded client-side, listed first.
  const [userDashboards, setUserDashboards] = useState<Dashboard[]>([]);
  useEffect(() => {
    setUserDashboards(loadUserDashboards().map(dashboardFromSpec));
  }, []);
  const allDashboards = [...userDashboards, ...mockDashboards];

  const close = () => {
    setOpen(false);
    setView('menu');
    setPicked(null);
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

  const saveToTab = (tab: { id: string; label: string }) => {
    if (!picked) return;
    addChartToDashboard(picked.id, tab.id, chart);
    const target = { id: picked.id, name: dashTitle(picked), tab: tab.label };
    close();
    setSavedTo(target);
    window.setTimeout(() => setSavedTo(null), 6000);
  };

  if (savedTo) {
    return (
      <Link
        href={`/dashboards/${savedTo.id}`}
        title={`Open ${savedTo.name}`}
        className="group/saved flex items-center gap-1.5 text-[11px] font-medium text-emerald-400 transition-colors hover:text-emerald-300"
      >
        <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        <span className="group-hover/saved:underline">
          Saved to {savedTo.name} · {savedTo.tab}
        </span>
        <svg className="h-3 w-3 shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        className="flex h-6 w-6 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 top-full z-20 mt-1 max-h-80 w-60 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            {view === 'menu' && (
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
            )}

            {view === 'dashboards' && (
              <>
                <BackHeader label="Choose a dashboard" onClick={() => setView('menu')} />
                {allDashboards.map((d) => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => {
                      setPicked(d);
                      setView('tabs');
                    }}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-zinc-800"
                  >
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-zinc-700 bg-zinc-800 text-[9px] font-bold text-zinc-300">
                      {d.clientInitials}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs text-white">{dashTitle(d)}</span>
                      <span className="block truncate text-[10px] text-zinc-500">{d.client}</span>
                    </span>
                    <svg className="h-3 w-3 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                ))}
              </>
            )}

            {view === 'tabs' && picked && (
              <>
                <BackHeader label={`Add to ${dashTitle(picked)}`} onClick={() => setView('dashboards')} />
                <p className="px-3 pb-1 pt-0.5 text-[10px] text-zinc-600">Pick a tab</p>
                {picked.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => saveToTab(tab)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
                  >
                    <svg className="h-3.5 w-3.5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    <span className="flex-1">{tab.label}</span>
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

function BackHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500 hover:text-zinc-300"
    >
      <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
      </svg>
      <span className="truncate">{label}</span>
    </button>
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
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-white"
    >
      <svg className="h-3.5 w-3.5 shrink-0 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
      <span className="flex-1">{label}</span>
      {chevron && (
        <svg className="h-3 w-3 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
}
