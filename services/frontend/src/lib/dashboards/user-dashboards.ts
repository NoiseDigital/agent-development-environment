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

/** Permanently remove a user dashboard. Caller is responsible for the policy
 *  check (`canDelete`) and for navigating away from the deleted dashboard. */
export function deleteUserDashboard(id: string): void {
  if (typeof window === 'undefined') return;
  try {
    const remaining = loadUserDashboards().filter((d) => d.id !== id);
    window.localStorage.setItem(KEY, JSON.stringify(remaining));
  } catch {
    /* ignore quota errors */
  }
}

/** True when this dashboard id was created by the user (lives in localStorage)
 *  vs. one of the code-defined seeds. Delete only applies to user dashboards;
 *  seeds are intentionally permanent until removed from the codebase. */
export function isUserDashboard(id: string): boolean {
  return loadUserDashboards().some((d) => d.id === id);
}
