'use client';

import { useState } from 'react';
import { mockDashboards, Dashboard, DashboardOwnership } from '../../data/mockDashboardData';
import ChartVisualization from '../../components/ChartVisualization';

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
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
      className="w-full text-left rounded-xl border border-zinc-800 bg-zinc-950 p-5 hover:border-zinc-700 hover:bg-zinc-900/60 transition-all duration-150 group"
    >
      <div className="flex items-start justify-between gap-3">
        {/* Client logo */}
        <div className="w-9 h-9 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-xs font-bold text-zinc-300 group-hover:border-zinc-600 transition-colors">
          {dashboard.clientInitials}
        </div>
        {/* Ownership badge */}
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider border ${ownershipBadge[dashboard.ownership]}`}>
          {ownershipLabel[dashboard.ownership]}
        </span>
      </div>

      <div className="mt-3">
        <h3 className="text-sm font-semibold text-white group-hover:text-zinc-100 transition-colors line-clamp-2 leading-snug">
          {dashboard.name}
        </h3>
        <p className="text-xs text-zinc-500 mt-1 line-clamp-2 leading-relaxed">{dashboard.description}</p>
      </div>

      <div className="mt-4 flex items-center justify-between text-[11px] text-zinc-600">
        <span>{dashboard.client}</span>
        <span>Updated {fmtDate(dashboard.lastUpdated)}</span>
      </div>

      {dashboard.ownership !== 'owned' && (
        <p className="mt-1 text-[11px] text-zinc-600">By {dashboard.owner}</p>
      )}
    </button>
  );
}

// ── Dashboard detail view ─────────────────────────────────────────────────────

function DashboardDetail({ dashboard, onBack }: { dashboard: Dashboard; onBack: () => void }) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-8 py-5 border-b border-zinc-800 shrink-0">
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
          <span className="text-[11px] text-zinc-600">Updated {fmtDate(dashboard.lastUpdated)}</span>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium text-zinc-400 bg-zinc-900 border border-zinc-800 rounded-lg hover:border-zinc-700 hover:text-white transition-colors"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            Export
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        <p className="text-xs text-zinc-500 mb-6 max-w-2xl">{dashboard.description}</p>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {dashboard.charts.map((chart, i) => (
            <div key={i} className={chart.type === 'funnel' ? 'xl:col-span-2' : ''}>
              <ChartVisualization
                type={chart.type}
                data={chart.data}
                title={chart.title}
                insight={chart.insight}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function DashboardsPage() {
  const [activeTab, setActiveTab] = useState<DashboardOwnership | 'all'>('all');
  const [selected, setSelected] = useState<Dashboard | null>(null);
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
      <div className="flex items-center justify-between px-8 py-5 border-b border-zinc-800 shrink-0">
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
      <div className="flex items-center gap-1 px-8 pt-4 pb-0 border-b border-zinc-800 shrink-0">
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
