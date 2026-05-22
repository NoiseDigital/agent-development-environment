// Codification requests — the bridge from rapid prototyping to dashboards-as-
// code. A media-team user builds an internal dashboard, then submits it for an
// engineer to codify (into a client dashboard, or as a reusable tile). The
// prototype stays editable; the codified result stays git-versioned and stable.
// localStorage today; this is a queue that moves to a table.

import { newId } from './id';

export type CodifyTarget = 'new-client' | 'existing-client' | 'reusable-tile';

export interface CodificationRequest {
  id: string;
  /** The internal dashboard being submitted. */
  dashboardId: string;
  dashboardName: string;
  /** What the submitter wants done with it. */
  target: CodifyTarget;
  /** When target is 'existing-client', the client dashboard to integrate into. */
  targetDashboardId?: string;
  /** Free-text notes for engineering — where/how to integrate. */
  notes: string;
  submittedAt: string;
  status: 'submitted';
}

const KEY = 'noise:codification-requests';

export function loadCodificationRequests(): CodificationRequest[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

/** Submit a dashboard for codification — appended newest-first. */
export function saveCodificationRequest(
  req: Omit<CodificationRequest, 'id' | 'submittedAt' | 'status'>,
): CodificationRequest {
  const full: CodificationRequest = {
    ...req,
    id: newId('codify'),
    submittedAt: new Date().toISOString(),
    status: 'submitted',
  };
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.setItem(KEY, JSON.stringify([full, ...loadCodificationRequests()]));
    } catch {
      /* ignore quota errors */
    }
  }
  return full;
}
