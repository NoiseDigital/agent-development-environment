'use client';

import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { clientDashboards, dashboardFromSpec, type Dashboard, type DashboardOwnership } from '../../data/dashboards';
import { clientBySlug } from '../../data/clients';
import { loadUserDashboards, deleteUserDashboard, isUserDashboard, saveUserDashboard } from '../../lib/dashboards/user-dashboards';
import { dashboardTitle, canDelete } from '../../lib/dashboards/access';
import { newId } from '../../lib/id';
import { showToast } from '../../lib/toast';
import NewDashboardModal from '../../components/dashboards/NewDashboardModal';

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
// Quiet card: brand mark, title, ownership badge, last updated, kebab menu.
// The card is a navigation target; the kebab is the in-list quick-action
// surface (copy / delete) so users don't have to enter the dashboard first.
// Client dashboards never expose Delete — `canDelete(dashboard)` is false
// for them. Inside-dashboard actions stay in the dashboard's own ⋯ menu.

interface CardActions {
  onOpen: () => void;
  onCopy: () => void;
  onDelete: () => void;
}

function DashboardCard({
  dashboard,
  actions,
}: {
  dashboard: Dashboard;
  actions: CardActions;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const title = dashboardTitle(dashboard);
  const client = clientBySlug(dashboard.clientInitials.toLowerCase());
  const deletable = canDelete(dashboard) && isUserDashboard(dashboard.id);

  // The whole card is a button to open the dashboard, but the kebab is its
  // own button stacked on top. We stop click propagation on the kebab so the
  // menu doesn't navigate.
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={actions.onOpen}
        className="flex w-full items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-950 p-4 text-left transition-colors duration-150 hover:border-zinc-700 hover:bg-zinc-900/60"
      >
        {/* Brand mark — image when the client has a logo, initials badge otherwise. */}
        {client.logoPath ? (
          <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
            <Image
              src={client.logoPath}
              alt={client.name}
              width={40}
              height={40}
              className="h-full w-full object-contain"
            />
          </div>
        ) : (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-[11px] font-bold text-zinc-300">
            {dashboard.clientInitials}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold leading-snug text-white">{title}</h3>
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">
            Updated {fmtDate(dashboard.lastUpdated)}
          </p>
        </div>

        <span
          className={`mr-7 shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${ownershipBadge[dashboard.ownership]}`}
        >
          {ownershipLabel[dashboard.ownership]}
        </span>
      </button>

      {/* Kebab — absolute-positioned over the card so the card itself stays a
          single click target for navigation. */}
      <div
        className="absolute right-3 top-1/2 -translate-y-1/2"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          aria-label="Dashboard actions"
          className="flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-white"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h.01M12 12h.01M19 12h.01" />
          </svg>
        </button>

        {menuOpen && (
          <>
            <button
              type="button"
              aria-label="Close menu"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
              className="fixed inset-0 z-10 cursor-default"
            />
            <div className="absolute right-0 top-full z-20 mt-1 w-40 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 py-1 shadow-xl">
              <CardMenuItem
                label="Make a copy"
                onClick={() => { setMenuOpen(false); actions.onCopy(); }}
              />
              {deletable && (
                <CardMenuItem
                  label="Delete"
                  destructive
                  onClick={() => { setMenuOpen(false); actions.onDelete(); }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CardMenuItem({
  label,
  onClick,
  destructive,
}: {
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center px-3 py-2 text-left text-[11px] transition-colors ${
        destructive
          ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
          : 'text-zinc-300 hover:bg-zinc-900 hover:text-white'
      }`}
    >
      {label}
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

  const allDashboards = [...userDashboards, ...clientDashboards];

  // Copy + Delete from the card kebab. Both refresh the user-dashboards
  // list in place so the grid reflects the change immediately.
  const handleCopy = useCallback((d: Dashboard) => {
    const id = newId();
    saveUserDashboard({
      id,
      name: dashboardTitle(d),
      campaignId: d.campaignId,
      createdAt: new Date().toISOString(),
    });
    showToast({ message: 'Copy created — rename it from the new dashboard.', tone: 'success' });
    router.push(`/dashboards/${id}`);
  }, [router]);

  const handleDelete = useCallback((d: Dashboard) => {
    if (!isUserDashboard(d.id)) return;
    if (!window.confirm(`Delete "${dashboardTitle(d)}"? This can't be undone.`)) return;
    deleteUserDashboard(d.id);
    setUserDashboards(loadUserDashboards().map(dashboardFromSpec));
    showToast({ message: 'Dashboard deleted.', tone: 'success' });
  }, []);

  const filtered = allDashboards.filter((d) => {
    const matchesTab = activeTab === 'all' || d.ownership === activeTab;
    const matchesSearch =
      !search.trim() ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.client.toLowerCase().includes(search.toLowerCase());
    return matchesTab && matchesSearch;
  });

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-800/60 px-8 py-5">
        <h1 className="text-lg font-semibold tracking-tight text-white">Dashboards</h1>
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
                actions={{
                  onOpen: () => router.push(`/dashboards/${dashboard.id}`),
                  onCopy: () => handleCopy(dashboard),
                  onDelete: () => handleDelete(dashboard),
                }}
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
