// Per-dashboard visual overrides (accent colour today). localStorage now,
// moves to the DB when codified dashboards land.

export interface DashboardOverrides {
  accentColor?: string;
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
