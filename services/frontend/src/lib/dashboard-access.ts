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

import type { Dashboard } from '../data/mock-dashboard-data';

/** A client dashboard is defined in code and delivered to the end client. */
export const isClientDashboard = (d: Dashboard): boolean => d.ownership === 'client';

/** Whether the dashboard's layout and tiles can be edited at runtime. */
export const isEditable = (d: Dashboard): boolean => !isClientDashboard(d);

/** Whether a chart can be pinned to this dashboard from chat. */
export const isPinnable = (d: Dashboard): boolean => !isClientDashboard(d);

/** Whether this dashboard can be shared out to the end client (vs. internal-only). */
export const canShareExternally = (d: Dashboard): boolean => isClientDashboard(d);

/** Display title — a client dashboard is titled by its client, others by name. */
export const dashboardTitle = (d: Dashboard): string =>
  isClientDashboard(d) ? d.client : d.name;
