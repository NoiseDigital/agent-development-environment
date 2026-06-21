// Hydration for user-created ("internal") dashboards. The persisted spec
// is just a tiny record (id, name, campaignId, optional defaultTabId,
// createdAt); we expand it into a full `Dashboard` by running the same
// tab assembly the canonical client dashboards use, then re-ordering tabs
// if the user has pinned one to be the landing tab.
//
// This is intentionally a SEPARATE hydrator from the client-dashboard
// definitions — user dashboards are owned by the creator (ownership =
// "owned"), not by a client, and they always use the standard tab set.

import { defaultClient } from '../clients';
import type { UserDashboardSpec } from '../../lib/dashboards/user-dashboards';
import type { Dashboard } from './types';
import { buildStandardTabs } from './tabs';

/** Hydrate a user-created dashboard spec into a full Dashboard. */
export function dashboardFromSpec(spec: UserDashboardSpec): Dashboard {
  const client = defaultClient(); // scope to the tenant's primary client
  let tabs = buildStandardTabs(spec.id);
  if (spec.defaultTabId) {
    const i = tabs.findIndex((t) => t.id === spec.defaultTabId);
    if (i > 0) tabs = [tabs[i], ...tabs.filter((_, idx) => idx !== i)];
  }
  return {
    id: spec.id,
    name: spec.name,
    client: client.name,
    clientInitials: client.initials,
    clientLogoPath: client.logoPath,
    owner: 'You',
    ownership: 'owned',
    lastUpdated: spec.createdAt.slice(0, 10),
    description: 'Editable internal dashboard.',
    accentColor: client.accentColor,
    filters: ['Campaign', 'Market', 'Format'],
    campaignId: spec.campaignId,
    tabs,
  };
}
