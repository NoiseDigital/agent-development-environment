'use client';

import { useState, useEffect, useCallback } from 'react';
import type { Layout } from 'react-grid-layout';
import type { Dashboard, DashboardTile, ChartTile } from '../data/mock-dashboard-data';
import { loadDashboardMeta, saveDashboardMeta, type DashboardMeta } from '../lib/dashboard-meta';
import { loadPinnedCharts, removePinnedChart } from '../lib/dashboard-store';
import DashboardCanvas from './DashboardCanvas';
import DashboardReportHeader from './DashboardReportHeader';
import DashboardFilterBar from './DashboardFilterBar';

// The opened-dashboard view: branded header, filter/edit toolbar, a tab bar
// (Overall + KPI-goal views), and the editable tile grid for the active tab.
// Each tab's tiles are derived from the media model; editing a layout is a
// session-only tweak (the dashboard itself is code).

const today = () => new Date().toISOString().slice(0, 10);

export default function DashboardDetail({
  dashboard,
  onBack,
}: {
  dashboard: Dashboard;
  onBack: () => void;
}) {
  const [activeTabId, setActiveTabId] = useState(dashboard.tabs[0]?.id ?? '');
  const activeTab = dashboard.tabs.find((t) => t.id === activeTabId) ?? dashboard.tabs[0];

  const [editing, setEditing] = useState(false);
  const [tiles, setTiles] = useState<DashboardTile[]>(activeTab?.tiles ?? []);
  const [deliveryDate, setDeliveryDate] = useState(dashboard.lastUpdated);
  const [refreshing, setRefreshing] = useState(false);

  // A tab's tiles = its code-derived report tiles plus any charts the user has
  // pinned to that tab from chat. Pins stack two-per-row beneath the report.
  const buildTiles = useCallback(
    (tabId: string): DashboardTile[] => {
      const tab = dashboard.tabs.find((t) => t.id === tabId);
      const codeTiles = tab?.tiles ?? [];
      const pins = loadPinnedCharts(dashboard.id, tabId);
      if (pins.length === 0) return codeTiles;
      const bottomY = codeTiles.reduce((m, t) => Math.max(m, t.layout.y + t.layout.h), 0);
      const pinTiles: ChartTile[] = pins.map((pin, i) => ({
        id: pin.id,
        type: 'chart',
        chart: pin.chart,
        layout: { x: (i % 2) * 6, y: bottomY + Math.floor(i / 2) * 9, w: 6, h: 9, minW: 3, minH: 4 },
      }));
      return [...codeTiles, ...pinTiles];
    },
    [dashboard],
  );

  // Re-seed the grid whenever the active tab changes — pins load after mount.
  useEffect(() => {
    setTiles(buildTiles(activeTabId));
    setEditing(false);
  }, [activeTabId, buildTiles]);

  // Editable meta (internal dashboards only) — loaded after mount for SSR parity.
  const isClient = dashboard.ownership === 'client';
  const [meta, setMeta] = useState<DashboardMeta>({});
  useEffect(() => {
    setMeta(loadDashboardMeta(dashboard.id));
  }, [dashboard.id]);

  const title = isClient ? dashboard.client : meta.title ?? dashboard.name;
  const shared = meta.shared ?? dashboard.ownership === 'shared';

  const persistMeta = useCallback(
    (next: DashboardMeta) => {
      setMeta(next);
      saveDashboardMeta(dashboard.id, next);
    },
    [dashboard.id],
  );
  const commitTitle = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (trimmed) persistMeta({ ...meta, title: trimmed });
    },
    [meta, persistMeta],
  );
  const toggleShare = useCallback(
    () => persistMeta({ ...meta, shared: !shared }),
    [meta, shared, persistMeta],
  );

  const handleLayoutChange = useCallback((layout: Layout) => {
    setTiles((prev) =>
      prev.map((t) => {
        const pos = layout.find((item) => item.i === t.id);
        return pos ? { ...t, layout: { ...t.layout, x: pos.x, y: pos.y, w: pos.w, h: pos.h } } : t;
      }),
    );
  }, []);

  const handleTextChange = useCallback((id: string, text: string) => {
    setTiles((prev) => prev.map((t) => (t.id === id && t.type === 'text' ? { ...t, text } : t)));
  }, []);

  const handleAddText = useCallback(() => {
    setTiles((prev) => {
      const bottom = prev.reduce((max, t) => Math.max(max, t.layout.y + t.layout.h), 0);
      const newTile: DashboardTile = {
        id: `text-${Date.now()}`,
        type: 'text',
        text: '',
        layout: { x: 0, y: bottom, w: 4, h: 3, minW: 2, minH: 1 },
      };
      return [...prev, newTile];
    });
  }, []);

  const handleRemoveTile = useCallback(
    (id: string) => {
      // Pinned charts (pin-* ids) are user data — removing one persists so it
      // doesn't reappear on the next load. Code tiles only drop for the session.
      if (id.startsWith('pin-')) removePinnedChart(dashboard.id, activeTabId, id);
      setTiles((prev) => prev.filter((t) => t.id !== id));
    },
    [dashboard.id, activeTabId],
  );

  const handleReset = useCallback(() => {
    setTiles(buildTiles(activeTabId));
  }, [buildTiles, activeTabId]);

  // Refresh — pulls the latest delivered performance. Mocked: a brief load,
  // then the tab re-derives and the delivery date advances.
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => {
      setTiles(buildTiles(activeTabId));
      setDeliveryDate(today());
      setRefreshing(false);
    }, 900);
  }, [buildTiles, activeTabId]);

  return (
    <div className="flex h-full flex-col bg-black">
      <DashboardReportHeader
        dashboard={dashboard}
        onBack={onBack}
        deliveryDate={deliveryDate}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        title={title}
        editableTitle={!isClient}
        onTitleCommit={commitTitle}
        shared={shared}
        onShareToggle={toggleShare}
      />

      {/* Toolbar — report filters + layout editing */}
      <div className="flex shrink-0 items-end justify-between gap-4 border-b border-zinc-800/60 px-6 py-3">
        <DashboardFilterBar filters={dashboard.filters} />
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleAddText}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add text
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-zinc-400 transition-colors hover:border-zinc-700 hover:text-white"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-zinc-200"
              >
                Done
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white"
            >
              <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Edit layout
            </button>
          )}
        </div>
      </div>

      {/* Tab bar — Overall + KPI-goal views */}
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800/60 px-6">
        {dashboard.tabs.map((tab) => {
          const active = tab.id === activeTab?.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {editing && (
          <div className="mb-4 flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
            Edit mode — drag a tile to move it, drag its bottom-right corner to resize.
          </div>
        )}
        <DashboardCanvas
          tiles={tiles}
          editing={editing}
          onLayoutChange={handleLayoutChange}
          onTextChange={handleTextChange}
          onRemoveTile={handleRemoveTile}
        />
      </div>
    </div>
  );
}
