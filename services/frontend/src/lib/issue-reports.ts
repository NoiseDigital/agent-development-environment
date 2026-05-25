// Issue reports — a lightweight "flag a problem" channel for any dashboard.
// Separate from codification requests (which promote a prototype to code): this
// is "something here looks wrong, please look". localStorage today; a table later.

import { newId } from './id';

export type IssueArea = 'data' | 'visual' | 'layout' | 'other';

export interface IssueReport {
  id: string;
  dashboardId: string;
  dashboardName: string;
  area: IssueArea;
  notes: string;
  submittedAt: string;
  status: 'open';
}

const KEY = 'noise:issue-reports';

export function loadIssueReports(): IssueReport[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** File an issue against a dashboard — appended newest-first. */
export function saveIssueReport(
  report: Omit<IssueReport, 'id' | 'submittedAt' | 'status'>,
): IssueReport {
  const full: IssueReport = {
    ...report,
    id: newId('issue'),
    submittedAt: new Date().toISOString(),
    status: 'open',
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify([full, ...loadIssueReports()]));
    } catch {
      /* ignore quota errors */
    }
  }
  return full;
}
