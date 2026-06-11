// NOI — the reference client plan. The IDs and dimensions here are
// real values pulled from the live performance table so the spreadsheet
// will join correctly out of the box (e.g. line `NOI-23-01-002` is the
// Ski AU Branded Search line that already has perf rows in BQ).
//
// A new client copies this file: change clientCode/clientName, then
// reshape `campaigns`. Everything else (the spreadsheet, the perf join,
// the history drawer) reads off this shape with no other edits.

import { clientBySlug } from '../../clients';
import type { ClientPlan } from '../types';

const client = clientBySlug('noi');

export const noiPlan: ClientPlan = {
  clientCode: 'NOI',
  clientName: client.name,
  campaigns: [
    {
      id: 'NOI-23-01',
      name: '23: Ski AU',
      phase: 'Book',
      marketGroup: 'AU',
      kpiGoal: 'referral',
      lines: [
        {
          id: 'NOI-23-01-002',
          publisher: 'Search Ads 360',
          platform: 'Google Ads + SA360',
          objective: 'dvan_counterIframe_ownedOutboundLinkClicks',
          marketingObjective: 'Outbound Partner Clicks',
          creativeFormat: 'Branded Search',
          budget: 66000,
          flightStart: '2023-07-25',
          flightEnd: '2023-09-15',
          creatives: [
            { id: 'NOI-23-01-002-001', name: 'Branded Search - AU' },
          ],
        },
        {
          id: 'NOI-23-01-003',
          publisher: 'Meta',
          platform: 'Meta Ads',
          objective: 'dvan_counterIframe_ownedOutboundLinkClicks',
          marketingObjective: 'Site Visits',
          creativeFormat: 'Reels',
          budget: 42000,
          flightStart: '2023-07-25',
          flightEnd: '2023-09-15',
          creatives: [
            { id: 'NOI-23-01-003-001', name: 'Reels - Powder Hero' },
            { id: 'NOI-23-01-003-002', name: 'Reels - Family Pack' },
          ],
        },
      ],
    },
    {
      id: 'NOI-24-01',
      name: '24: Summer AU',
      phase: 'Travel',
      marketGroup: 'AU',
      kpiGoal: 'engagement',
      lines: [
        {
          id: 'NOI-24-01-001',
          publisher: 'YouTube',
          platform: 'YouTube Ads',
          objective: 'dvan_counterIframe_videoComplete',
          marketingObjective: 'Video Views',
          creativeFormat: 'Video',
          budget: 88000,
          flightStart: '2024-10-01',
          flightEnd: '2024-12-15',
          creatives: [
            { id: 'NOI-24-01-001-001', name: 'Summer Hero - 30s' },
            { id: 'NOI-24-01-001-002', name: 'Summer Hero - 15s' },
          ],
        },
      ],
    },
  ],
};
