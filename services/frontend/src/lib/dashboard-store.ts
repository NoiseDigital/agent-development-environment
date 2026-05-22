import { ChartData } from '../types/chart';
import { newId } from './id';

// Personal pinned charts — agent-generated visuals a user pins to a dashboard
// TAB. Kept separate from the code-defined report tiles (which derive their
// data from the media model): pins are user data. A dashboard has tabs, so a
// pin is addressed by (dashboardId, tabId). localStorage today; moves to a
// table with the rest of the user data.

export interface PinnedChart {
  id: string;
  chart: ChartData;
}

const KEY = 'noise:dashboard-pins';

// { [dashboardId]: { [tabId]: PinnedChart[] } }
type TabMap = Record<string, PinnedChart[]>;
type PinStore = Record<string, TabMap>;

function readAll(): PinStore {
  if (typeof window === 'undefined') return {};
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(store: PinStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* ignore quota errors */
  }
}

/** Coerce a dashboard entry to a plain tab-map. An earlier build keyed pins by
 *  dashboard only (a bare array). A legacy array entry must be discarded, not
 *  reused: writing a string (tab) key onto an array is dropped by JSON.stringify,
 *  which silently loses every pin. This is the fix for that. */
function asTabMap(value: unknown): TabMap {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as TabMap) : {};
}

/** The charts a user has pinned to one tab of a dashboard. */
export function loadPinnedCharts(dashboardId: string, tabId: string): PinnedChart[] {
  const tab = asTabMap(readAll()[dashboardId])[tabId];
  return Array.isArray(tab) ? tab : [];
}

/** Pin an (agent-generated) chart to a specific dashboard tab. */
export function addChartToDashboard(
  dashboardId: string,
  tabId: string,
  chart: ChartData,
): PinnedChart {
  const store = readAll();
  const pin: PinnedChart = { id: newId('pin'), chart };
  const dash = asTabMap(store[dashboardId]);
  dash[tabId] = [...(Array.isArray(dash[tabId]) ? dash[tabId] : []), pin];
  store[dashboardId] = dash;
  writeAll(store);
  return pin;
}

/** Remove a pinned chart from a dashboard tab. */
export function removePinnedChart(dashboardId: string, tabId: string, pinId: string): void {
  const store = readAll();
  const dash = asTabMap(store[dashboardId]);
  if (!Array.isArray(dash[tabId])) return;
  dash[tabId] = dash[tabId].filter((p) => p.id !== pinId);
  store[dashboardId] = dash;
  writeAll(store);
}
