// NOI — the canonical client dashboard. This is the smallest reasonable
// DAaC file: a seed (metadata) and a tab assembly delegated to the
// reference composition. Adding a new client means COPYING this file,
// changing the seed, and (only if needed) replacing `buildStandardTabs`
// with a bespoke composition.

import { clientBySlug } from '@/data/clients';
import type { Dashboard } from '@/data/dashboards/types';
import { buildStandardTabs } from '@/data/dashboards/tabs';

export const noiDashboard: Dashboard = (() => {
  const client = clientBySlug('noi');
  return {
    id: 'NOI',
    name: 'Noise Performance — Client Report',
    client: client.name,
    clientInitials: client.initials,
    clientLogoPath: client.logoPath,
    owner: 'Marcus T.',
    ownership: 'client',
    lastUpdated: '2025-05-12',
    description: 'Client-facing performance report on the NOI media dataset.',
    accentColor: client.accentColor,
    filters: ['Campaign', 'Market', 'Publisher', 'Format'],
    campaignId: 'noi-all',
    tabs: buildStandardTabs('NOI'),
  };
})();

// Registry of this tenant's code-defined client dashboards.
export const clientDashboards: Dashboard[] = [noiDashboard];
