// Dashboard access policy — the one place that answers "what can be done with
// this dashboard". Client dashboards are code-defined and immutable at runtime;
// internal dashboards (owned / shared) are editable. Call sites import the
// predicate that names their concern instead of re-deriving `ownership` checks,
// so when the policy changes it changes here — not in eight files.
//
// isEditable / isPinnable / canShareExternally are distinct predicates even
// though some share an implementation today: they are separate decisions, and
// keeping them named means a future rule (e.g. view-only shares) is a one-line
// change here rather than a hunt across call sites.

import type { Dashboard } from '../data/dashboards';
import { getCurrentUser } from './auth';

/** A client dashboard is defined in code and delivered to the end client. */
export const isClientDashboard = (d: Dashboard): boolean => d.ownership === 'client';

/** Whether the dashboard's layout and tiles can be edited at runtime. */
export const isEditable = (d: Dashboard): boolean => !isClientDashboard(d);

/** Whether a chart can be pinned to this dashboard from chat. */
export const isPinnable = (d: Dashboard): boolean => !isClientDashboard(d);

/** Whether this dashboard can be shared out to the end client (vs. internal-only). */
export const canShareExternally = (d: Dashboard): boolean => isClientDashboard(d);

/** Whether the current user is the owner of the dashboard. The dev seam uses
 *  a single 'You' owner; production will compare against `getCurrentUser().uid`
 *  once dashboards carry an owner uid (today's `owner` is the display name).
 *
 *  Keep this isolated — when the migration to uid-keyed ownership happens, the
 *  change is local to this file. */
export const isOwner = (d: Dashboard): boolean => {
  // Dev seam: any dashboard owned by the literal "You" belongs to the dev
  // identity. Admins also count as effective owners for back-office actions —
  // RBAC's escape hatch for the platform team.
  if (d.owner === 'You') return true;
  return getCurrentUser().role === 'admin';
};

/** Whether the current user can hard-delete this dashboard. Owner-only by
 *  design: an admin who is not the owner can still un-share / archive via
 *  separate flows; deletion is a destructive action and stays with the
 *  person responsible for the dashboard's content. */
export const canDelete = (d: Dashboard): boolean =>
  !isClientDashboard(d) && d.owner === 'You';

/** Display title — a client dashboard is titled by its client, others by name. */
export const dashboardTitle = (d: Dashboard): string =>
  isClientDashboard(d) ? d.client : d.name;
