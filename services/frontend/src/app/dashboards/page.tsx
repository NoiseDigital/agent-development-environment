'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { mockDashboards, dashboardFromSpec, Dashboard, DashboardOwnership } from '../../data/mock-dashboard-data';
import { loadUserDashboards } from '../../lib/user-dashboards';
import NewDashboardModal from '../../components/NewDashboardModal';

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
  owned: 'bg-accent-500/15 text-accent-400 border-accent-500/30',
  shared: 'bg-accent-500/15 text-accent-400 border-accent-500/30',
  client: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const ownershipLabel: Record<DashboardOwnership, string> = {
  owned: 'Mine',
  shared: 'Shared',
  client: 'Client',
};

// ── Dashboard card ────────────────────────────────────────────────────────────

function DashboardCard({ dashboard, onClick }: { dashboard: Dashboard; onClick: () => void }) {
  // A client dashboard is titled by the client; internal ones by their name.
  const title = dashboard.ownership === 'client' ? dashboard.client : dashboard.name;
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex h-full w-full flex-col rounded-xl border border-zinc-800 bg-zinc-950 p-5 text-left transition-all duration-150 hover:border-zinc-700 hover:bg-zinc-900/60"
    >
      <div className="flex shrink-0 items-start justify-between gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-bold text-zinc-300 transition-colors group-hover:border-zinc-600">
          {dashboard.clientInitials}
        </div>
        <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ownershipBadge[dashboard.ownership]}`}>
          {ownershipLabel[dashboard.ownership]}
        </span>
      </div>

      <div className="mt-3 flex-1">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-white transition-colors group-hover:text-zinc-100">
          {title}
        </h3>
        <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-zinc-500">{dashboard.description}</p>
      </div>

      <div className="mt-4 shrink-0 space-y-1 text-[11px] text-zinc-600">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate">{dashboard.client}</span>
          <span className="shrink-0 whitespace-nowrap">Updated {fmtDate(dashboard.lastUpdated)}</span>
        </div>
        <p className="h-[1em]">{dashboard.ownership !== 'owned' ? `By ${dashboard.owner}` : ''}</p>
      </div>
    </button>
  );
}

// ── Page — the dashboard listing ──────────────────────────────────────────────

export default function DashboardsPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DashboardOwnership | 'all'>('all');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  // User-created dashboards load client-side; merged ahead of the code-defined ones.
  const [userDashboards, setUserDashboards] = useState<Dashboard[]>([]);
  useEffect(() => {
    setUserDashboards(loadUserDashboards().map(dashboardFromSpec));
  }, []);

  const allDashboards = [...userDashboards, ...mockDashboards];
  const filtered = allDashboards.filter((d) => {
    const matchesTab = activeTab === 'all' || d.ownership === activeTab;
    const matchesSearch =
      !search.trim() ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.client.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="flex h-full flex-col bg-black">
      {/* Page header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/60 px-8 py-5">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-white">Dashboards</h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {allDashboards.length} dashboards across {new Set(allDashboards.map((d) => d.client)).size} clients
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search dashboards…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-52 rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-4 text-xs text-white placeholder-zinc-600 transition-colors focus:border-zinc-600 focus:outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black transition-colors hover:bg-zinc-100"
          >
            <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
            </svg>
            New Dashboard
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex shrink-0 items-center gap-1 border-b border-zinc-800/60 px-8 pb-0 pt-4">
        {tabs.map((tab) => {
          const count =
            tab.key === 'all'
              ? allDashboards.length
              : allDashboards.filter((d) => d.ownership === tab.key).length;
          const active = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`-mb-px flex items-center gap-1.5 rounded-t border-b-2 px-3 py-2.5 text-xs font-medium transition-colors duration-150 ${
                active
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-500 hover:border-zinc-700 hover:text-zinc-300'
              }`}
            >
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 font-mono text-[10px] ${active ? 'bg-zinc-700 text-zinc-200' : 'bg-zinc-900 text-zinc-600'}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Cards grid */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {filtered.length > 0 ? (
          <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filtered.map((dashboard) => (
              <DashboardCard
                key={dashboard.id}
                dashboard={dashboard}
                onClick={() => router.push(`/dashboards/${dashboard.id}`)}
              />
            ))}
          </div>
        ) : (
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <p className="text-sm text-zinc-500">No dashboards found</p>
            {search && <p className="mt-1 text-xs text-zinc-600">for &ldquo;{search}&rdquo;</p>}
          </div>
        )}
      </div>

      {modalOpen && <NewDashboardModal onClose={() => setModalOpen(false)} />}
    </div>
  );
}
