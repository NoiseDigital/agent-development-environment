// Per-dashboard visual overrides — accent colour, per-tile presentation
// (title / subtitle / valueFormat / accent / description), and a soft-
// remove list for tiles the user (or the editor agent) hid from this
// dashboard. localStorage now; moves to the DB when codified dashboards
// land.
//
// The render path (DashboardCanvas / DashboardDetail) reads these on top
// of the seed dashboard so a per-dashboard edit doesn't fork the shared
// tile component or the seed itself.

import type { PresentationOverrides } from '../../data/dashboards/types';

export interface DashboardOverrides {
  accentColor?: string;
  /** Per-tile presentation overrides keyed by tile id. Merged INTO the
   *  seed tile's own `presentation` field at render time (this layer wins
   *  because it represents user intent on a specific dashboard). */
  tilePresentation?: Record<string, PresentationOverrides>;
  /** Tile ids the user removed from this dashboard. For pinned chart
   *  tiles we hit pinsApi.remove instead — this list is for code-defined
   *  seed tiles that don't have a server-side delete path. */
  removedTileIds?: string[];
}

const KEY = 'noise:dashboard-overrides';

type OverrideMap = Record<string, DashboardOverrides>;

function readAll(): OverrideMap {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}') as OverrideMap;
  } catch {
    return {};
  }
}

function writeAll(map: OverrideMap): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* ignore quota errors */
  }
}

export function loadDashboardOverrides(id: string): DashboardOverrides {
  return readAll()[id] ?? {};
}

export function setDashboardOverride<K extends keyof DashboardOverrides>(
  id: string,
  key: K,
  value: DashboardOverrides[K],
): void {
  const all = readAll();
  const existing = all[id] ?? {};
  if (value === undefined) {
    delete existing[key];
  } else {
    existing[key] = value;
  }
  if (Object.keys(existing).length === 0) {
    delete all[id];
  } else {
    all[id] = existing;
  }
  writeAll(all);
}

// ── Per-tile helpers ────────────────────────────────────────────────────────

/** Merge a partial presentation override onto a tile (additive — fields
 *  not in `patch` are preserved). Empty patch is a no-op. */
export function setTilePresentation(
  dashboardId: string,
  tileId: string,
  patch: PresentationOverrides,
): void {
  if (!patch || Object.keys(patch).length === 0) return;
  const all = readAll();
  const existing = all[dashboardId] ?? {};
  const tiles = { ...(existing.tilePresentation ?? {}) };
  tiles[tileId] = { ...(tiles[tileId] ?? {}), ...patch };
  // Strip undefined fields that the caller may have used to clear an
  // override (e.g. "reset title to seed default").
  for (const k of Object.keys(tiles[tileId]) as (keyof PresentationOverrides)[]) {
    if (tiles[tileId][k] === undefined) delete tiles[tileId][k];
  }
  all[dashboardId] = { ...existing, tilePresentation: tiles };
  writeAll(all);
}

/** Soft-remove a tile (used for code-defined seed tiles that don't have
 *  a server-side delete). Pinned chart tiles use pinsApi.remove instead. */
export function markTileRemoved(dashboardId: string, tileId: string): void {
  const all = readAll();
  const existing = all[dashboardId] ?? {};
  const removed = new Set(existing.removedTileIds ?? []);
  removed.add(tileId);
  all[dashboardId] = { ...existing, removedTileIds: [...removed] };
  writeAll(all);
}

/** Apply per-tile presentation overrides + soft-remove filter to a list of
 *  tiles. Returns a new array. Pure — caller wraps in useMemo if needed.
 *  Used by DashboardDetail to project the editor agent's writes onto the
 *  seed tile list without touching the seed dashboard itself. */
export function applyTileOverrides<T extends { id: string; presentation?: PresentationOverrides }>(
  tiles: readonly T[],
  overrides: DashboardOverrides,
): T[] {
  const removed = new Set(overrides.removedTileIds ?? []);
  const byTile = overrides.tilePresentation ?? {};
  return tiles
    .filter((t) => !removed.has(t.id))
    .map((t) => {
      const patch = byTile[t.id];
      if (!patch || Object.keys(patch).length === 0) return t;
      return { ...t, presentation: { ...(t.presentation ?? {}), ...patch } };
    });
}

/** Undo a soft-remove (admin / restore flow). */
export function unmarkTileRemoved(dashboardId: string, tileId: string): void {
  const all = readAll();
  const existing = all[dashboardId];
  if (!existing?.removedTileIds?.length) return;
  const remaining = existing.removedTileIds.filter((id) => id !== tileId);
  if (remaining.length === 0) {
    const { removedTileIds, ...rest } = existing;
    void removedTileIds;
    all[dashboardId] = rest;
  } else {
    all[dashboardId] = { ...existing, removedTileIds: remaining };
  }
  writeAll(all);
}
