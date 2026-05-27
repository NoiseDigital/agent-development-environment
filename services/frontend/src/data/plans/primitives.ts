// The vocabulary every plan line picks from. These match the categorical
// values that appear in the BQ performance table — keeping them in code
// gives a typed dropdown UX and prevents a planner from typing a
// publisher name that no performance row will ever match.
//
// Adding a value here is a one-line change; the spreadsheet column picks
// it up via the select renderer with no further wiring.

import type { CampaignPhase } from './types';

/** Publishers we can plan against. Source of truth: the `publisher` column
 *  in `media_campaign_performance_NOI`. */
export const PUBLISHERS = [
  'Search Ads 360',
  'Meta',
  'Google',
  'YouTube',
  'TikTok',
  'Reddit',
  'X',
  'LinkedIn',
  'Programmatic',
] as const;

/** Platforms a publisher serves on. */
export const PLATFORMS = [
  'Google Ads + SA360',
  'Meta Ads',
  'YouTube Ads',
  'TikTok Ads',
  'Reddit Ads',
  'X Ads',
  'LinkedIn Ads',
  'DV360',
] as const;

/** Creative formats — narrows the inventory a line buys against. */
export const CREATIVE_FORMATS = [
  'Branded Search',
  'Generic Search',
  'Display',
  'Native',
  'Video',
  'Stories',
  'Reels',
  'Carousel',
  'Audio',
] as const;

/** Campaign-phase values that appear in `campaign_phase`. */
export const CAMPAIGN_PHASES: CampaignPhase[] = ['Book', 'Travel', 'Plan'];

/** KPI archetypes — match `kpi_goal`. */
export const KPI_GOALS = ['referral', 'awareness', 'engagement', 'conversion'] as const;

/** Marketing objectives — the human-readable goal beneath each line. */
export const MARKETING_OBJECTIVES = [
  'Outbound Partner Clicks',
  'Brand Lift',
  'Video Views',
  'Lead Form Submissions',
  'Reach',
  'Frequency',
  'Site Visits',
  'App Installs',
  'Conversions',
] as const;
