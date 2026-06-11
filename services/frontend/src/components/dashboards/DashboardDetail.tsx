'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { Layout } from 'react-grid-layout';
import type { Dashboard, DashboardTile, ChartTile } from '../../data/dashboards';
import { pinsApi, type PinnedChart } from '../../lib/dashboards/pins-api';
import { invalidateDashboardCache } from '../../lib/dashboards';
import {
  markDashboardRefreshed,
  formatRefreshTime,
} from '../../lib/dashboards/refresh';
import { canDelete, isClientDashboard, isEditable, isPinnable } from '../../lib/dashboards/access';
import { deleteUserDashboard, isUserDashboard, saveUserDashboard } from '../../lib/dashboards/user-dashboards';
import { applyTileOverrides, loadDashboardOverrides, setDashboardOverride } from '../../lib/dashboards/overrides';
import { newId } from '../../lib/id';
import { isAdmin } from '../../lib/auth';
import { showToast } from '../../lib/toast';
import { DashboardEditProvider, fireAddVizIntent } from '../../lib/dashboards/edit-context';
import { DashboardFilterProvider } from '../../lib/dashboards/filter-context';
import { DashboardTotalsProvider } from '../../lib/dashboards/totals-context';
import { DashboardRefreshProvider } from '../../lib/dashboards/refresh-context';
import DashboardCanvas from './DashboardCanvas';
import DashboardReportHeader from './DashboardReportHeader';
import DashboardFilterBar from './DashboardFilterBar';
import DashboardActionsMenu, { type DashboardAction } from './DashboardActionsMenu';
import CodifyDashboardModal from './CodifyDashboardModal';
import ShareDashboardModal from './ShareDashboardModal';
import FlagIssueModal from './FlagIssueModal';

// The opened-dashboard view: branded header, filter/edit toolbar, a tab bar
// (Overall + KPI-goal views), and the editable tile grid for the active tab.
// Every dashboard-level action is reached through the one ⋯ menu.

// SVG path `d` strings for the actions-menu icons.
const ICON = {
  share:
    'M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z',
  copy: 'M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2',
  codify: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
  edit: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z',
  flag: 'M3 21v-8m0 0V4h12l-2 4 2 4H3z',
  fullscreen: 'M4 8V5a1 1 0 011-1h3m8 0h3a1 1 0 011 1v3m0 8v3a1 1 0 01-1 1h-3m-8 0H5a1 1 0 01-1-1v-3',
  trash: 'M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M1 7h22M9 7V4a1 1 0 011-1h4a1 1 0 011 1v3',
};

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
  // Pins fetched server-side. The Set of pin ids is the runtime discriminator
  // ("is this tile user-pinned or code-derived?") — used to scope removal so
  // we only DELETE on the server for actual pins, not for code tiles the user
  // hides for the session.
  const [pinIds, setPinIds] = useState<Set<string>>(new Set());
  // "Latest delivery" — wall-clock of when this user last loaded this
  // dashboard. Initial state is null (NOT a value read from localStorage),
  // which is what SSR renders too — same output on server and client, no
  // hydration mismatch. After hydrate, the useEffect below sets it to
  // `Date.now()` so the user sees "Just now" the moment the page is live.
  //
  // The localStorage layer is intentionally write-only on mount: re-opening
  // a dashboard always shows "Just now" because the tiles fetch fresh data
  // every mount. Tracking the LAST refresh as opposed to the LAST view would
  // require persistence-on-Refresh-only, which we can add if it ever matters.
  const [refreshedAt, setRefreshedAt] = useState<number | null>(null);
  useEffect(() => {
    const now = Date.now();
    markDashboardRefreshed(dashboard.id, now);
    setRefreshedAt(now);
  }, [dashboard.id]);
  // Tick the displayed relative string every 30s so "Just now" → "1 min ago"
  // updates without the user reloading the page.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((n) => n + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  // Empty string during SSR (matches `refreshedAt = null`) — DashboardReportHeader
  // renders nothing visible until the client hydrates, then ticks to "Just now".
  const deliveryDate = refreshedAt ? formatRefreshTime(refreshedAt) : '';
  const [refreshing, setRefreshing] = useState(false);
  const [codifyOpen, setCodifyOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [flagOpen, setFlagOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // Compose the tile list from the code-derived report tiles + the fetched
  // pin list. Pins stack two-per-row beneath the report. Pure function: takes
  // the inputs and returns the merged list, so refetching pins later can
  // re-run this without re-deriving anything.
  const mergeTiles = useCallback(
    (tabId: string, pins: PinnedChart[]): DashboardTile[] => {
      const tab = dashboard.tabs.find((t) => t.id === tabId);
      const codeTiles = tab?.tiles ?? [];
      if (!isPinnable(dashboard) || pins.length === 0) return codeTiles;
      const bottomY = codeTiles.reduce((m, t) => Math.max(m, t.layout.y + t.layout.h), 0);
      const pinTiles: ChartTile[] = pins.map((pin, i) => ({
        id: pin.id,
        type: 'chart',
        chart: pin.spec,
        layout: { x: (i % 2) * 6, y: bottomY + Math.floor(i / 2) * 9, w: 6, h: 9, minW: 3, minH: 4 },
      }));
      return [...codeTiles, ...pinTiles];
    },
    [dashboard],
  );

  /** Load pins for the active tab from the server, then merge them into the
   *  tile list. Returns the pin ids so callers (e.g. handleRefresh) can wait
   *  for the update before clearing their loading state. */
  const reloadPins = useCallback(async (): Promise<void> => {
    if (!isPinnable(dashboard)) {
      setPinIds(new Set());
      setTiles(mergeTiles(activeTabId, []));
      return;
    }
    try {
      const pins = await pinsApi.list(dashboard.id, activeTabId);
      setPinIds(new Set(pins.map((p) => p.id)));
      setTiles(mergeTiles(activeTabId, pins));
    } catch {
      // Network or auth failure — fall back to the code tiles only so the
      // dashboard still renders. The pin endpoint is not load-bearing.
      setPinIds(new Set());
      setTiles(mergeTiles(activeTabId, []));
    }
  }, [dashboard, activeTabId, mergeTiles]);

  // Re-seed the grid whenever the active tab changes.
  useEffect(() => {
    setEditing(false);
    void reloadPins();
  }, [activeTabId, reloadPins]);

  // Display title — client dashboards use the client name; everything else
  // uses the dashboard's own name (kept in local state so the inline-rename
  // is responsive while the persisted update is in flight).
  const isClient = isClientDashboard(dashboard);
  const [localName, setLocalName] = useState(dashboard.name);
  useEffect(() => { setLocalName(dashboard.name); }, [dashboard.id, dashboard.name]);
  const title = isClient ? dashboard.client : localName;

  // Renaming an internal dashboard writes back to the same user_dashboards
  // entry the listing page reads. The card on /dashboards uses the same
  // `name` field, so the rename is reflected everywhere on the next load.
  // (Client dashboards are code-defined and not renamable; `editableTitle`
  // is false for them so this never fires for those.)
  // Header accent — base color from the dashboard / client × per-dashboard
  // override. The override store is read once on mount and updated optimistically
  // on every picker selection so the header re-renders instantly. Persisted in
  // localStorage today (see `lib/dashboards/overrides`) so it survives reloads;
  // moves to the DB when codified dashboards land.
  const [accentColor, setAccentColor] = useState(dashboard.accentColor);
  // Per-tile overrides (title / format / accent / etc.) + soft-remove list
  // written by the editor agent's `update_tile` / `remove_tile` actions.
  // Re-derived from localStorage on mount and on every dashboard-override-
  // changed event so an agent edit shows without a reload.
  const [tileOverrides, setTileOverrides] = useState(() => loadDashboardOverrides(dashboard.id));
  useEffect(() => {
    const ov = loadDashboardOverrides(dashboard.id);
    setAccentColor(ov.accentColor ?? dashboard.accentColor);
    setTileOverrides(ov);
  }, [dashboard.id, dashboard.accentColor]);
  // The dashboard editor agent writes through `setDashboardOverride` from a
  // GenUI Action block — listen for the broadcast so the header AND any
  // per-tile overrides re-read without a refresh.
  useEffect(() => {
    const onChange = (e: Event) => {
      const ce = e as CustomEvent<{ dashboardId: string }>;
      if (ce.detail?.dashboardId !== dashboard.id) return;
      const ov = loadDashboardOverrides(dashboard.id);
      setAccentColor(ov.accentColor ?? dashboard.accentColor);
      setTileOverrides(ov);
    };
    window.addEventListener('dashboard-override-changed', onChange);
    return () => window.removeEventListener('dashboard-override-changed', onChange);
  }, [dashboard.id, dashboard.accentColor]);
  // Same for rename — the agent writes through `saveUserDashboard`; we re-
  // read the local name from the broadcast detail so the header refreshes
  // immediately.
  useEffect(() => {
    const onRenamed = (e: Event) => {
      const ce = e as CustomEvent<{ dashboardId: string; name: string }>;
      if (ce.detail?.dashboardId !== dashboard.id) return;
      setLocalName(ce.detail.name);
    };
    window.addEventListener('dashboard-renamed', onRenamed);
    return () => window.removeEventListener('dashboard-renamed', onRenamed);
  }, [dashboard.id]);
  const handleAccentChange = useCallback(
    (hex: string) => {
      setAccentColor(hex);
      // Treat "set to the seed color" as a reset — store nothing in that case
      // so deleting the seed in code (or the client adopting a new accent)
      // wins by default.
      const value = hex.toLowerCase() === dashboard.accentColor.toLowerCase() ? undefined : hex;
      setDashboardOverride(dashboard.id, 'accentColor', value);
    },
    [dashboard.id, dashboard.accentColor],
  );

  const commitTitle = useCallback(
    (next: string) => {
      const trimmed = next.trim();
      if (!trimmed || trimmed === localName) return;
      setLocalName(trimmed);
      if (isUserDashboard(dashboard.id)) {
        saveUserDashboard({
          id: dashboard.id,
          name: trimmed,
          campaignId: dashboard.campaignId,
          createdAt: new Date().toISOString(),
        });
      }
    },
    [dashboard.id, dashboard.campaignId, localName],
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
      // Pinned tiles are user data — DELETE on the server so they don't come
      // back on the next load. Code-derived tiles only drop for the session.
      if (pinIds.has(id)) {
        pinsApi.remove(id).catch(() => { /* best-effort; the tile is already gone locally */ });
      }
      setTiles((prev) => prev.filter((t) => t.id !== id));
    },
    [pinIds],
  );

  const handleReset = useCallback(() => {
    void reloadPins();
  }, [reloadPins]);

  // Refresh — invalidates the shared BQ cache (so every tile's next fetch
  // re-pulls from BQ instead of hitting the cached promise), bumps a version
  // counter that tiles include in their useEffect deps (so they re-run),
  // re-fetches pins, and updates the "Latest Delivery" wall-clock.
  //
  // Tab changes don't trigger this — they unmount/remount tiles but the
  // cache keeps the same (tool, params) Promise resolved, so they paint
  // instantly. Only the Refresh button is supposed to repull from BQ.
  const [refreshVersion, setRefreshVersion] = useState(0);
  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    invalidateDashboardCache();
    setRefreshVersion((v) => v + 1);
    void reloadPins().finally(() => {
      const now = Date.now();
      markDashboardRefreshed(dashboard.id, now);
      setRefreshedAt(now);
      setRefreshing(false);
    });
  }, [reloadPins, dashboard.id]);

  // Make a copy — forks an editable internal dashboard. For a client dashboard
  // this is the only edit path (the copy loses client share-out). The new
  // dashboard inherits the source's title verbatim; the user renames it
  // inline on the destination page if they want something different. We
  // intentionally don't append "(copy)" or compose any name out of client
  // fields — the source title is whatever the user/admin already chose.
  const handleDuplicate = useCallback(() => {
    const id = newId();
    saveUserDashboard({
      id,
      name: title,
      campaignId: dashboard.campaignId,
      createdAt: new Date().toISOString(),
    });
    showToast({ message: 'Copy created — rename it from the new dashboard.', tone: 'success' });
    router.push(`/dashboards/${id}`);
  }, [title, dashboard.campaignId, router]);

  // Present mode — the dashboard fills the screen with no platform chrome.
  const handleFullscreen = useCallback(() => {
    rootRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  // Delete — gated by ownership AND by whether this is a user-created
  // dashboard (the code-defined NOI seeds aren't deletable at runtime, they
  // live in the repo). The owner check uses `canDelete` so the policy lives
  // in dashboard-access; the user-dashboard check answers "is there even a
  // localStorage row to delete?".
  const showDelete = canDelete(dashboard) && isUserDashboard(dashboard.id);
  const handleDelete = useCallback(() => {
    if (!showDelete) return;
    // Confirm before destructive action — same affordance the chat sidebar
    // delete uses; we don't have a custom modal for this yet.
    if (!window.confirm(`Delete "${title}"? This can't be undone.`)) return;
    deleteUserDashboard(dashboard.id);
    showToast({ message: 'Dashboard deleted.', tone: 'success' });
    router.push('/dashboards');
  }, [showDelete, title, dashboard.id, router]);

  // Every dashboard-level action, consolidated into the one ⋯ menu. Codify and
  // Edit layout are internal-only (client dashboards are code). Delete only
  // appears for user-created dashboards owned by the current user.
  const actions: DashboardAction[] = [
    { label: 'Share', icon: ICON.share, onClick: () => setShareOpen(true) },
    { label: 'Make a copy', icon: ICON.copy, onClick: handleDuplicate },
    ...(isClient
      ? []
      : [
          { label: 'Submit for codification', icon: ICON.codify, onClick: () => setCodifyOpen(true) },
          { label: 'Edit layout', icon: ICON.edit, onClick: () => setEditing(true) },
        ]),
    { label: 'Flag an issue', icon: ICON.flag, onClick: () => setFlagOpen(true) },
    { label: 'Fullscreen', icon: ICON.fullscreen, onClick: handleFullscreen },
    ...(showDelete
      ? [{ label: 'Delete dashboard', icon: ICON.trash, onClick: handleDelete, tone: 'destructive' as const }]
      : []),
  ];

  // Provide dashboard context to the layout-level FloatingAssistant ALWAYS
  // (not just edit mode) — the chat needs it in view mode too so the analyst
  // can ground its answers in the tiles + cross-reference other tabs. The
  // `canGenerate` flag still gates the editor-agent routing + save-to-
  // dashboard affordance, so view mode stays read-only.
  const canGenerate = editing && isPinnable(dashboard) && isAdmin;
  const editContext = activeTab
    ? {
        dashboardId: dashboard.id,
        dashboardName: dashboard.name,
        tabId: activeTabId,
        tabLabel: activeTab.label,
        canGenerate,
        tabs: dashboard.tabs,
        activeTab: {
          id: activeTabId,
          label: activeTab.label,
          // The MERGED runtime tile list (code-derived + pinned charts) — that's
          // what the user actually sees, and that's what the agent should ground in.
          tiles,
        },
        onPinned: () => { void reloadPins(); },
      }
    : null;

  return (
    <DashboardRefreshProvider value={{ version: refreshVersion }}>
    <DashboardFilterProvider>
    <DashboardTotalsProvider>
    <DashboardEditProvider value={editContext}>
    <div ref={rootRef} className="flex h-full flex-col bg-canvas">
      <DashboardReportHeader
        dashboard={dashboard}
        onBack={onBack}
        deliveryDate={deliveryDate}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        title={title}
        editableTitle={isEditable(dashboard)}
        onTitleCommit={commitTitle}
        accentColor={accentColor}
        editingAccent={editing}
        onAccentChange={handleAccentChange}
      />

      {/* Toolbar — report filters, plus the one actions menu (or edit controls) */}
      <div className="flex shrink-0 items-end justify-between gap-4 border-b border-line/60 px-6 py-3">
        <DashboardFilterBar />
        <div className="flex shrink-0 items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                onClick={handleAddText}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add text
              </button>
              {/* Viz generation lives in the floating Ask Agent. This button
                  fires an "add viz" intent — the assistant opens, prefills its
                  input with a starter prompt, and surfaces one-click suggestion
                  chips so the workflow is discoverable on click rather than
                  buried in a hint. */}
              {isAdmin && (
                <button
                  type="button"
                  onClick={() =>
                    fireAddVizIntent(
                      'What visualizations would you like to add?',
                      [
                        'Weekly spend by publisher',
                        'CTR by creative format',
                        'Top 10 campaigns by engaged visits',
                        'Spend vs. impressions over time',
                      ],
                    )
                  }
                  className="flex items-center gap-1.5 rounded-lg border border-accent-400/40 bg-accent-400/10 px-3 py-1.5 text-[11px] font-medium text-accent-200 transition-colors hover:border-accent-400 hover:bg-accent-400/20"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                  Ask agent to add a viz
                </button>
              )}
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-subtle transition-colors hover:border-line-strong hover:text-foreground"
              >
                <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reset
              </button>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="rounded-lg bg-inverse px-3 py-1.5 text-[11px] font-semibold text-inverse-foreground transition-colors hover:bg-inverse/90"
              >
                Done
              </button>
            </>
          ) : (
            <DashboardActionsMenu actions={actions} />
          )}
        </div>
      </div>

      {/* Tab bar — Overall + KPI-goal views */}
      <div className="flex shrink-0 items-center gap-1 border-b border-line/60 px-6">
        {dashboard.tabs.map((tab) => {
          const active = tab.id === activeTab?.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTabId(tab.id)}
              className={`-mb-px border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                active
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-faint hover:border-line-strong hover:text-muted'
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
          <div className="mb-4 flex items-center gap-2 text-[11px] text-faint">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-400" />
            Edit mode — drag a tile to move it, drag its bottom-right corner to resize.
          </div>
        )}
        <DashboardCanvas
          tiles={applyTileOverrides(tiles, tileOverrides)}
          editing={editing}
          dashboardDefaults={dashboard.defaults}
          onLayoutChange={handleLayoutChange}
          onTextChange={handleTextChange}
          onRemoveTile={handleRemoveTile}
        />
      </div>

      {codifyOpen && <CodifyDashboardModal dashboard={dashboard} onClose={() => setCodifyOpen(false)} />}
      {shareOpen && <ShareDashboardModal dashboard={dashboard} onClose={() => setShareOpen(false)} />}
      {flagOpen && <FlagIssueModal dashboard={dashboard} onClose={() => setFlagOpen(false)} />}
    </div>
    </DashboardEditProvider>
    </DashboardTotalsProvider>
    </DashboardFilterProvider>
    </DashboardRefreshProvider>
  );
}
