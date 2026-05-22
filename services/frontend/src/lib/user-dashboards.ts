// User-created dashboards — persisted as small specs (user data: localStorage
// today, DB later). Tiles are never stored; they rebuild fresh from the media
// model on load, so a user dashboard stays as live as a code-defined one.

export interface UserDashboardSpec {
  id: string;
  name: string;
  campaignId: string;
  /** Tab to open on — set by generative composition to surface the focus. */
  defaultTabId?: string;
  createdAt: string;
}

const KEY = 'noise:user-dashboards';

export function loadUserDashboards(): UserDashboardSpec[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

export function saveUserDashboard(spec: UserDashboardSpec): void {
  if (typeof window === 'undefined') return;
  try {
    const others = loadUserDashboards().filter((d) => d.id !== spec.id);
    window.localStorage.setItem(KEY, JSON.stringify([spec, ...others]));
  } catch {
    /* ignore quota errors */
  }
}
