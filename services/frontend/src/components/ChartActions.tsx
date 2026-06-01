'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { toPng } from 'html-to-image';
import { clientDashboards, dashboardFromSpec, type Dashboard } from '../data/dashboards';
import { loadUserDashboards, saveUserDashboard } from '../lib/dashboards/user-dashboards';
import { pinsApi } from '../lib/dashboards/pins-api';
import { dashboardTitle as dashTitle, isPinnable } from '../lib/dashboards/access';
import { saveIssueReport } from '../lib/issue-reports';
import { showToast } from '../lib/toast';
import { newId } from '../lib/id';
import { specTitle, slug, chartToCsv } from '../lib/charts/export';
import type { VegaSpec } from '../types/genui';

interface ChartActionsProps {
  chart: VegaSpec;
  /** The chart card node — captured for PNG export. */
  captureRef: React.RefObject<HTMLDivElement | null>;
  /** Hide save-to-dashboard — for charts already on a dashboard (export-only menu). */
  exportsOnly?: boolean;
}

function triggerDownload(filename: string, href: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
}

// "+" menu on chat / Analyze visuals: save to a dashboard, export PNG, export
// CSV. Saving is a two-step pick — a dashboard, then which of its tabs — since
// a dashboard's tiles live on tabs.
export default function ChartActions({ chart, captureRef, exportsOnly = false }: ChartActionsProps) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'dashboards' | 'tabs' | 'flag' | 'create-new'>('menu');
  const [picked, setPicked] = useState<Dashboard | null>(null);
  const [savedTo, setSavedTo] = useState<{ id: string; name: string; tab: string } | null>(null);
  const [flagNotes, setFlagNotes] = useState('');
  const [newName, setNewName] = useState('');

  // Pinning is a runtime edit, so it can only target editable dashboards —
  // client dashboards are code-defined and immutable. User-created dashboards
  // load client-side and list first.
  const [userDashboards, setUserDashboards] = useState<Dashboard[]>([]);
  useEffect(() => {
    setUserDashboards(loadUserDashboards().map(dashboardFromSpec));
  }, []);
  const editableDashboards = [...userDashboards, ...clientDashboards].filter(isPinnable);

  const close = () => {
    setOpen(false);
    setView('menu');
    setPicked(null);
    setFlagNotes('');
    setNewName('');
  };

  const submitFlag = () => {
    const notes = flagNotes.trim();
    if (!notes) return;
    saveIssueReport({
      chartTitle: specTitle(chart),
      area: 'visual',
      notes,
    });
    showToast({ message: 'Chart flagged — thanks, the team will take a look.', tone: 'success' });
    close();
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
      triggerDownload(`${slug(specTitle(chart))}.png`, dataUrl);
    } catch (e) {
      console.error('PNG export failed', e);
    }
  };

  const handleCsv = () => {
    close();
    const blob = new Blob([chartToCsv(chart)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    triggerDownload(`${slug(specTitle(chart))}.csv`, url);
    URL.revokeObjectURL(url);
  };

  const handleSvg = () => {
    close();
    const svg = captureRef.current?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(`${slug(specTitle(chart))}.svg`, url);
    URL.revokeObjectURL(url);
  };

  const saveToTab = (tab: { id: string; label: string }) => {
    if (!picked) return;
    const target = { id: picked.id, name: dashTitle(picked), tab: tab.label };
    // Optimistic close so the kebab doesn't feel laggy. Surface failures via
    // toast + console so the user knows the save didn't persist (silent
    // catches here used to mask broken pinsApi calls).
    void pinsApi.create(picked.id, tab.id, chart).catch((err) => {
      console.warn('[ChartActions] pin to existing failed', picked.id, tab.id, err);
      showToast({ message: `Couldn't save to ${target.name} · ${target.tab}. Try again.`, tone: 'error' });
      setSavedTo(null);
    });
    close();
    setSavedTo(target);
    window.setTimeout(() => setSavedTo(null), 6000);
  };

  // "+ Create new personal report" flow from inside the dashboards picker.
  // Mirrors the saveUserDashboard shape NewDashboardModal writes, then pins
  // the chart to the new dashboard's overall tab so the user lands on a
  // populated report.
  const createAndPin = () => {
    const name = newName.trim() || defaultPersonalReportName();
    const id = newId();
    saveUserDashboard({
      id,
      name,
      campaignId: 'all',
      defaultTabId: 'overall',
      createdAt: new Date().toISOString(),
    });
    const target = { id, name, tab: 'Overall' };
    void pinsApi.create(id, 'overall', chart).catch((err) => {
      console.warn('[ChartActions] create + pin failed', id, err);
      showToast({ message: `Created "${name}" but couldn't pin the chart. Open the report to add it manually.`, tone: 'error' });
    });
    // Keep the new dashboard visible in the picker for follow-up saves.
    setUserDashboards((prev) => [
      dashboardFromSpec({ id, name, campaignId: 'all', defaultTabId: 'overall', createdAt: new Date().toISOString() }),
      ...prev,
    ]);
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
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
        </svg>
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={close} />
          <div className="absolute right-0 top-full z-20 mt-1 max-h-80 w-60 overflow-y-auto rounded-lg border border-zinc-700 bg-zinc-900 py-1 shadow-xl">
            {view === 'menu' && (
              <>
                {!exportsOnly && (
                  <MenuItem
                    label="Save to dashboard"
                    chevron
                    onClick={() => setView('dashboards')}
                    icon="M9 17V7m6 10v-4M3 5a2 2 0 012-2h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5z"
                  />
                )}
                <MenuItem
                  label="Save as PNG"
                  onClick={handlePng}
                  icon="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM10 9a1 1 0 11-2 0 1 1 0 012 0z"
                />
                <MenuItem
                  label="Save as SVG"
                  onClick={handleSvg}
                  icon="M16 18l6-6-6-6M8 6l-6 6 6 6"
                />
                <MenuItem
                  label="Export raw data"
                  onClick={handleCsv}
                  icon="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                />
                <div className="my-1 border-t border-zinc-800" />
                <MenuItem
                  label="Flag this chart"
                  onClick={() => setView('flag')}
                  icon="M3 21v-8m0 0V4h12l-2 4 2 4H3z"
                />
              </>
            )}

            {view === 'flag' && (
              <>
                <BackHeader label="Flag this chart" onClick={() => setView('menu')} />
                <div className="px-3 pb-2 pt-1">
                  <p className="mb-1.5 text-[10px] text-zinc-500">
                    What&apos;s wrong with <span className="text-zinc-300">{specTitle(chart)}</span>?
                  </p>
                  <textarea
                    value={flagNotes}
                    onChange={(e) => setFlagNotes(e.target.value)}
                    rows={3}
                    placeholder="Describe the issue…"
                    autoFocus
                    className="w-full resize-none rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-white placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setView('menu')}
                      className="rounded-md px-2 py-1 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitFlag}
                      disabled={!flagNotes.trim()}
                      className="rounded-md bg-white px-2.5 py-1 text-[10px] font-semibold text-black transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Submit
                    </button>
                  </div>
                </div>
              </>
            )}

            {view === 'dashboards' && (
              <>
                <BackHeader label="Choose a dashboard" onClick={() => setView('menu')} />
                <button
                  type="button"
                  onClick={() => setView('create-new')}
                  className="flex w-full items-center gap-2.5 border-b border-zinc-800/60 px-3 py-2 text-left text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 hover:text-white"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dashed border-zinc-600 text-zinc-400">
                    <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                    </svg>
                  </span>
                  <span className="flex-1">Create new personal report</span>
                </button>
                {editableDashboards.length > 0 ? (
                  editableDashboards.map((d) => (
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
                  ))
                ) : (
                  <p className="px-3 py-3 text-[11px] text-zinc-500">
                    No editable dashboards yet — create one from the Dashboards page.
                  </p>
                )}
                <p className="mt-1 border-t border-zinc-800 px-3 pb-1 pt-2 text-[10px] leading-relaxed text-zinc-600">
                  Client dashboards are code-defined — duplicate one to pin to it.
                </p>
              </>
            )}

            {view === 'create-new' && (
              <>
                <BackHeader label="New personal report" onClick={() => setView('dashboards')} />
                <div className="px-3 pb-2 pt-1">
                  <p className="mb-1.5 text-[10px] text-zinc-500">
                    Pin <span className="text-zinc-300">{specTitle(chart)}</span> to a brand-new report.
                  </p>
                  <input
                    autoFocus
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') createAndPin();
                      if (e.key === 'Escape') setView('dashboards');
                    }}
                    placeholder={defaultPersonalReportName()}
                    className="w-full rounded-md border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-[11px] text-white placeholder-zinc-600 focus:border-zinc-600 focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setView('dashboards')}
                      className="rounded-md px-2 py-1 text-[10px] font-medium text-zinc-400 transition-colors hover:bg-zinc-800 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={createAndPin}
                      className="rounded-md bg-white px-2.5 py-1 text-[10px] font-semibold text-black transition-colors hover:bg-zinc-200"
                    >
                      Create + pin
                    </button>
                  </div>
                </div>
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

// Short, timestamped default name so rapid-fire saves don't collapse into
// identical names.
function defaultPersonalReportName(): string {
  const d = new Date();
  const month = d.toLocaleString('en-US', { month: 'short' });
  return `Personal Report — ${month} ${d.getDate()}`;
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
