import { ChartData } from '../types/chart';
import { Dashboard, DashboardTile, ChartTile } from '../data/mock-dashboard-data';

// Mock persistence layer for dashboards. Layouts and saved visuals live in
// localStorage, keyed by dashboard id. Swapping these functions for a backend
// API later would not require touching any component.

const KEY_PREFIX = 'noise:dashboard:';

function storageKey(id: string): string {
  return `${KEY_PREFIX}${id}`;
}

/** Load a dashboard's tiles — persisted edits if present, otherwise the defaults. */
export function loadDashboardTiles(dashboard: Dashboard): DashboardTile[] {
  if (typeof window === 'undefined') return dashboard.tiles;
  try {
    const raw = window.localStorage.getItem(storageKey(dashboard.id));
    if (raw) return JSON.parse(raw) as DashboardTile[];
  } catch {
    /* ignore corrupt storage */
  }
  return dashboard.tiles;
}

/** Persist a dashboard's tiles. */
export function saveDashboardTiles(id: string, tiles: DashboardTile[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(tiles));
  } catch {
    /* ignore quota errors */
  }
}

/** Append a chart as a new tile at the bottom of a dashboard's grid and persist it. */
export function addChartToDashboard(dashboard: Dashboard, chart: ChartData): void {
  const tiles = loadDashboardTiles(dashboard);
  const bottom = tiles.reduce((max, t) => Math.max(max, t.layout.y + t.layout.h), 0);
  const isFunnel = chart.type === 'funnel';
  const newTile: ChartTile = {
    id: `chart-${Date.now()}-${Math.round(Math.random() * 10000)}`,
    type: 'chart',
    chart,
    layout: {
      x: 0,
      y: bottom,
      w: isFunnel ? 12 : 6,
      h: 9,
      minW: isFunnel ? 4 : 3,
      minH: 5,
    },
  };
  saveDashboardTiles(dashboard.id, [...tiles, newTile]);
}
