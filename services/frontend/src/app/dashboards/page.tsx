'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { mockDashboards, Dashboard, DashboardOwnership, DashboardTile } from '../../data/mock-dashboard-data';
import type { Layout } from 'react-grid-layout';
import DashboardCanvas from '../../components/DashboardCanvas';
import { loadDashboardTiles, saveDashboardTiles } from '../../lib/dashboard-store';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  // Format in UTC so server and client agree — a YYYY-MM-DD string parses as
  // UTC midnight, and a local-timezone format would shift the day and break hydration.
  return new Date(iso).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

const tabs: { key: DashboardOwnership | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'owned', label: 'Mine' },
  { key: 'shared', label: 'Shared with Me' },
  { key: 'client', label: 'Client Reports' },
];

const ownershipBadge: Record<DashboardOwnership, string> = {
  owned: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  shared: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  client: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const ownershipLabel: Record<DashboardOwnership, string> = {
  owned: 'Mine',
  shared: 'Shared',
  client: 'Client',
};

// ── Dashboard card ────────────────────────────────────────────────────────────

function DashboardCard({ dashboard, onClick }: { dashboard: Dashboard; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full h-full text-left rounded-xl border border-zinc-800 bg-zinc-950 p-5 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-150 group flex flex-col"
    >
      {/* Header row: initials + badge */}
      <div className="flex items-start justify-between gap-3 shrink-0">
        <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-xs font-bold text-zinc-300 group-hover:border-zinc-600 transition-colors">
          {dashboard.clientInitials}
        </div>
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${ownershipBadge[dashboard.ownership]}`}>
          {ownershipLabel[dashboard.ownership]}
        </span>
      </div>

      {/* Body: title + description — grows to push footer down */}
      <div className="mt-3 flex-1">
        <h3 className="text-sm font-semibold text-white group-hover:text-zinc-100 transition-colors line-clamp-2 leading-snug">
          {dashboard.name}
        </h3>
        <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">{dashboard.description}</p>
      </div>

      {/* Footer: pinned to bottom, consistent height across all cards */}
      <div className="mt-4 shrink-0 text-[11px] text-zinc-600 space-y-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{dashboard.client}</span>
          <span className="shrink-0 whitespace-nowrap">Updated {fmtDate(dashboard.lastUpdated)}</span>
        </div>
        <p className="h-[1em]">
          {dashboard.ownership !== 'owned' ? `By ${dashboard.owner}` : ''}
        </p>
      </div>
    </button>
  );
}

// ── Dashboard detail view ─────────────────────────────────────────────────────

function DashboardDetail({ dashboard, onBack }: { dashboard: Dashboard; onBack: () => void }) {
  const [editing, setEditing] = useState(false);
  const [tiles, setTiles] = useState<DashboardTile[]>(() => loadDashboardTiles(dashboard));

  // Persist layout/text edits so they survive a refresh.
  useEffect(() => {
    saveDashboardTiles(dashboard.id, tiles);
  }, [dashboard.id, tiles]);

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

  const handleRemoveTile = useCallback((id: string) => {
    setTiles((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const handleReset = useCallback(() => {
    setTiles(dashboard.tiles);
  }, [dashboard.tiles]);

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Header */}
      <div className="flex items-center gap-4 px-8 py-5 border-b border-zinc-800/60 shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-zinc-400 hover:text-white transition-colors text-xs"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Dashboards
        </button>
        <span className="text-zinc-700">/</span>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-md bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-[10px] font-bold text-zinc-300">
            {dashboard.clientInitials}
          </div>
          <h1 className="text-sm font-semibold text-white truncate">{dashboard.name}</h1>
          <span className={`hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border shrink-0 ${ownershipBadge[dashboard.ownership]}`}>
            {ownershipLabel[dashboard.ownership]}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleAddText}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:text-white transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add text
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:text-white transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-3 py-1.5 text-[11px] font-semibold text-black bg-white rounded-lg hover:bg-zinc-200 transition-colors"
              >
                Done
              </button>
            </>
          ) : (
            <>
              <span className="text-[11px] text-zinc-600">Updated {fmtDate(dashboard.lastUpdated)}</span>
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-300 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:text-white transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                Edit layout
              </button>
            </>
          )}
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {editing && (
          <div className="mb-4 flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0" />
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

// ── Page ──────────────────────────────────────────────────────────────────────

function DashboardsBrowser() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardOwnership | 'all'>('all');
  // Deep-link support: /dashboards?id=<id> opens that dashboard directly.
  const [selected, setSelected] = useState<Dashboard | null>(
    () => mockDashboards.find((d) => d.id === searchParams.get('id')) ?? null,
  );
  const [search, setSearch] = useState('');

  if (selected) {
    return <DashboardDetail dashboard={selected} onBack={() => setSelected(null)} />;
  }

  const filtered = mockDashboards.filter((d) => {
    const matchesTab = activeTab === 'all' || d.ownership === activeTab;
    const matchesSearch =
      !search.trim() ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.client.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="flex flex-col h-full bg-black">
      {/* Page header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-zinc-800/60 shrink-0">
        <div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Dashboards</h1>
          <p className="text-xs text-zinc-500 mt-0.5">{mockDashboards.length} dashboards across {new Set(mockDashboards.map((d) => d.client)).size} clients</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search dashboards…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 pr-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 w-52 transition-colors"
            />
          </div>
          <button
            type="button"
            className="flex items-center gap-2 px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-zinc-100 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Dashboard
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 px-8 pt-4 pb-0 border-b border-zinc-800/60 shrink-0">
        {tabs.map((tab) => {
          const count = tab.key === 'all'
            ? mockDashboards.length
            : mockDashboards.filter((d) => d.ownership === tab.key).length;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium rounded-t border-b-2 transition-colors duration-150 -mb-px ${
                active
                  ? 'text-white border-white'
                  : 'text-zinc-500 border-transparent hover:text-zinc-300 hover:border-zinc-700'
              }`}
            >
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono ${active ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-900 text-zinc-600'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 items-stretch">
            {filtered.map((dashboard) => (
              <DashboardCard
                key={dashboard.id}
                dashboard={dashboard}
                onClick={() => setSelected(dashboard)}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <p className="text-zinc-500 text-sm">No dashboards found</p>
            {search && <p className="text-zinc-600 text-xs mt-1">for &ldquo;{search}&rdquo;</p>}
          </div>
        )}
      </div>
    </div>
  );
}

// useSearchParams requires a Suspense boundary around the component that reads it.
export default function DashboardsPage() {
  return (
    <Suspense fallback={null}>
      <DashboardsBrowser />
    </Suspense>
  );
}
