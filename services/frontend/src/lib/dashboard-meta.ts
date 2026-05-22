// Mock persistence for editable dashboard metadata — the title and share status
// of internal dashboards. localStorage today; a row update once dashboards are
// DB-backed. Client dashboards aren't editable (their title is the client), so
// only internal dashboards ever write here.

export interface DashboardMeta {
  title?: string;
  shared?: boolean;
}

const KEY = 'noise:dashboard-meta';

function readAll(): Record<string, DashboardMeta> {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '{}');
  } catch {
    return {};
  }
}

/** The stored meta override for a dashboard ({} when none). */
export function loadDashboardMeta(id: string): DashboardMeta {
  return readAll()[id] ?? {};
}

/** Persist a dashboard's meta override. */
export function saveDashboardMeta(id: string, meta: DashboardMeta): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...readAll(), [id]: meta }));
  } catch {
    /* ignore quota errors */
  }
}
