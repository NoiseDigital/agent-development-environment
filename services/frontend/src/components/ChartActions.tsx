'use client';

import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { toPng } from 'html-to-image';
import { clientDashboards, dashboardFromSpec, type Dashboard } from '../data/dashboards';
import { loadUserDashboards, saveUserDashboard } from '../lib/dashboards/user-dashboards';
import { track } from '../lib/analytics/track';
import { pinsApi } from '../lib/dashboards/pins-api';
import { dashboardTitle as dashTitle, isPinnable } from '../lib/dashboards/access';
import { saveIssueReport } from '../lib/api/issue-reports';
import { showToast } from '../lib/toast';
import { newId } from '../lib/id';
import { specTitle, slug, chartToCsv } from '../lib/charts/export';
import type { VegaSpec } from '../types/genui';

interface ChartActionsProps {
  /** The chart card / tile node — captured for PNG export. PNG always
   *  works as long as the ref points at a real DOM node; SVG export
   *  queries this same subtree for an `<svg>` element so it works for
   *  any tile that renders one (Vega charts, the heatmap, etc.). */
  captureRef: React.RefObject<HTMLDivElement | null>;
  /** Optional Vega-Lite spec. When present, the kebab gains data-driven
   *  exports (CSV from `spec.data.values`) and the "Save to dashboard"
   *  path. When omitted, only DOM-driven actions (PNG, SVG-if-present,
   *  Flag, Delete) appear — that's the mode used for non-chart tiles
   *  (KPI / pivot / narrative) so they get the SAME kebab consistently. */
  chart?: VegaSpec;
  /** Optional name surfaced in PNG filename and the flag dialog when
   *  there's no chart spec (so e.g. KPI tiles export as `spend.png`). */
  fallbackTitle?: string;
  /** Hide save-to-dashboard — for charts already on a dashboard (export-only menu). */
  exportsOnly?: boolean;
  /** Edit-mode only: dashboard tiles pass this so the kebab shows a
   *  "Delete visual" item. The standalone X button on the tile is gone —
   *  the kebab is the single place tile-level actions live. */
  onDelete?: () => void;
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
export default function ChartActions({ chart, fallbackTitle, captureRef, exportsOnly = false, onDelete }: ChartActionsProps) {
  // Compute once: the title used for filenames / the flag dialog.
  const title = chart ? specTitle(chart) : (fallbackTitle ?? 'visual');
  // Capability flags — chart-only exports gate on the spec being present.
  // Save-to-dashboard also needs a spec (the API call carries it through).
  // SVG export probes the DOM at click time so it's offered whenever the
  // capture ref contains an `<svg>` element, chart or not.
  const canExportData = !!chart && Array.isArray((chart.data as { values?: unknown[] } | undefined)?.values);
  const canSaveToDashboard = !!chart && !exportsOnly;
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'menu' | 'dashboards' | 'tabs' | 'flag' | 'create-new'>('menu');
  const [picked, setPicked] = useState<Dashboard | null>(null);
  const [savedTo, setSavedTo] = useState<{ id: string; name: string; tab: string } | null>(null);
  const [flagNotes, setFlagNotes] = useState('');
  const [newName, setNewName] = useState('');
  // Portal coordinates for the dropdown — recomputed whenever it opens so
  // the menu hugs the kebab button regardless of scroll position. Width 240
  // matches the menu's `w-60`; we anchor by the button's right edge so the
  // menu sits flush against the kebab and never spills off the right side
  // of a narrow card.
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    // Right-align the 240px-wide menu against the button's right edge.
    setMenuPos({ top: rect.bottom, left: rect.right - 240 });
  }, [open]);

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
      chartTitle: title,
      area: 'visual',
      notes,
    });
    showToast({ message: 'Visual flagged — thanks, the team will take a look.', tone: 'success' });
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
      triggerDownload(`${slug(title)}.png`, dataUrl);
    } catch (e) {
      console.error('PNG export failed', e);
    }
  };

  const handleCsv = () => {
    close();
    if (!chart) return;
    const blob = new Blob([chartToCsv(chart)], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    triggerDownload(`${slug(title)}.csv`, url);
    URL.revokeObjectURL(url);
  };

  const handleSvg = () => {
    close();
    const svg = captureRef.current?.querySelector('svg');
    if (!svg) return;
    const xml = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([xml], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    triggerDownload(`${slug(title)}.svg`, url);
    URL.revokeObjectURL(url);
  };

  const saveToTab = (tab: { id: string; label: string }) => {
    if (!picked || !chart) return;
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
    track('chart_pinned', { new_dashboard: false });
    window.setTimeout(() => setSavedTo(null), 6000);
  };

  // "+ Create new personal report" flow from inside the dashboards picker.
  // Mirrors the saveUserDashboard shape NewDashboardModal writes, then pins
  // the chart to the new dashboard's overall tab so the user lands on a
  // populated report.
  const createAndPin = () => {
    if (!chart) return;
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
    track('chart_pinned', { new_dashboard: true });
    window.setTimeout(() => setSavedTo(null), 6000);
  };

  if (savedTo) {
    return (
      <Link
        href={`/dashboards/${savedTo.id}`}
        title={`Open ${savedTo.name}`}
        className="group/saved flex items-center gap-1.5 text-[11px] font-medium text-positive transition-colors hover:text-positive/80"
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
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Chart actions"
        className="flex h-6 w-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-raised hover:text-foreground"
      >
        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
        </svg>
      </button>

      {open && mounted && createPortal(
        <>
          <div className="fixed inset-0 z-[1000]" onClick={close} />
          <div
            // Portal'd into document.body so neither the tile's
            // overflow:hidden nor a sibling grid item's stacking context
            // can clip / cover the menu. Position is computed against the
            // trigger button's bounding rect.
            style={{
              position: 'fixed',
              top: menuPos.top,
              left: menuPos.left,
              zIndex: 1001,
            }}
            className="mt-1 max-h-80 w-60 overflow-y-auto rounded-lg border border-line-strong bg-surface py-1 shadow-xl">
            {view === 'menu' && (
              <>
                {canSaveToDashboard && (
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
                {/* SVG export probes the DOM at click time for an <svg/> node —
                    so we offer it whenever the tile contains one. Vega-rendered
                    tiles all do; pure-DOM tiles (KPI, narrative, pivot) don't.
                    Showing the item universally + erroring quietly would be
                    misleading, so we gate it on whether the chart spec is
                    present (proxy for "this tile rendered a Vega SVG"). */}
                {!!chart && (
                  <MenuItem
                    label="Save as SVG"
                    onClick={handleSvg}
                    icon="M16 18l6-6-6-6M8 6l-6 6 6 6"
                  />
                )}
                {canExportData && (
                  <MenuItem
                    label="Export raw data"
                    onClick={handleCsv}
                    icon="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                )}
                <div className="my-1 border-t border-line" />
                <MenuItem
                  label="Flag this visual"
                  onClick={() => setView('flag')}
                  icon="M3 21v-8m0 0V4h12l-2 4 2 4H3z"
                />
                {onDelete && (
                  <>
                    <div className="my-1 border-t border-line" />
                    <button
                      type="button"
                      onClick={() => {
                        close();
                        onDelete();
                      }}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-danger transition-colors hover:bg-danger/10 hover:text-danger"
                    >
                      <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V5a2 2 0 012-2h2a2 2 0 012 2v2" />
                      </svg>
                      <span className="flex-1">Delete visual</span>
                    </button>
                  </>
                )}
              </>
            )}

            {view === 'flag' && (
              <>
                <BackHeader label="Flag this visual" onClick={() => setView('menu')} />
                <div className="px-3 pb-2 pt-1">
                  <p className="mb-1.5 text-[10px] text-faint">
                    What&apos;s wrong with <span className="text-muted">{title}</span>?
                  </p>
                  <textarea
                    value={flagNotes}
                    onChange={(e) => setFlagNotes(e.target.value)}
                    rows={3}
                    placeholder="Describe the issue…"
                    autoFocus
                    className="w-full resize-none rounded-md border border-line bg-surface-sunken px-2 py-1.5 text-[11px] text-foreground placeholder-disabled focus:border-line-strong focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setView('menu')}
                      className="rounded-md px-2 py-1 text-[10px] font-medium text-subtle transition-colors hover:bg-surface-raised hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={submitFlag}
                      disabled={!flagNotes.trim()}
                      className="rounded-md bg-inverse px-2.5 py-1 text-[10px] font-semibold text-inverse-foreground transition-colors hover:bg-inverse/90 disabled:cursor-not-allowed disabled:opacity-40"
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
                  className="flex w-full items-center gap-2.5 border-b border-line/60 px-3 py-2 text-left text-xs font-medium text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-dashed border-line-strong text-subtle">
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
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-surface-raised"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-line-strong bg-surface-raised text-[9px] font-bold text-muted">
                        {d.clientInitials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs text-foreground">{dashTitle(d)}</span>
                        <span className="block truncate text-[10px] text-faint">{d.client}</span>
                      </span>
                      <svg className="h-3 w-3 shrink-0 text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))
                ) : (
                  <p className="px-3 py-3 text-[11px] text-faint">
                    No editable dashboards yet — create one from the Dashboards page.
                  </p>
                )}
                <p className="mt-1 border-t border-line px-3 pb-1 pt-2 text-[10px] leading-relaxed text-disabled">
                  Client dashboards are code-defined — duplicate one to pin to it.
                </p>
              </>
            )}

            {view === 'create-new' && (
              <>
                <BackHeader label="New personal report" onClick={() => setView('dashboards')} />
                <div className="px-3 pb-2 pt-1">
                  <p className="mb-1.5 text-[10px] text-faint">
                    Pin <span className="text-muted">{title}</span> to a brand-new report.
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
                    className="w-full rounded-md border border-line bg-surface-sunken px-2 py-1.5 text-[11px] text-foreground placeholder-disabled focus:border-line-strong focus:outline-none"
                  />
                  <div className="mt-2 flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setView('dashboards')}
                      className="rounded-md px-2 py-1 text-[10px] font-medium text-subtle transition-colors hover:bg-surface-raised hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={createAndPin}
                      className="rounded-md bg-inverse px-2.5 py-1 text-[10px] font-semibold text-inverse-foreground transition-colors hover:bg-inverse/90"
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
                <p className="px-3 pb-1 pt-0.5 text-[10px] text-disabled">Pick a tab</p>
                {picked.tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => saveToTab(tab)}
                    className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
                  >
                    <svg className="h-3.5 w-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
                    </svg>
                    <span className="flex-1">{tab.label}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </>,
        document.body,
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
      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint hover:text-muted"
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
      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs text-muted transition-colors hover:bg-surface-raised hover:text-foreground"
    >
      <svg className="h-3.5 w-3.5 shrink-0 text-faint" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
      </svg>
      <span className="flex-1">{label}</span>
      {chevron && (
        <svg className="h-3 w-3 shrink-0 text-disabled" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
        </svg>
      )}
    </button>
  );
}
