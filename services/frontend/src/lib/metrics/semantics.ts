// Canonical metric + dimension definitions. One sheet, optional per-dashboard
// overrides via the `overrides` arg on getMetricDefinition.

export interface MetricDefinition {
  label: string;
  summary: string;
  formula?: string;
  unit?: 'currency' | 'count' | 'percent' | 'ratio';
  /** When true, a falling value is GOOD (CPC / CPM / CPA). */
  betterLower?: boolean;
  notes?: string;
}

export const METRIC_DEFINITIONS: Record<string, MetricDefinition> = {
  total_spend: {
    label: 'Spend',
    summary: 'Gross media spend (publisher fees + fees) for the window.',
    unit: 'currency',
  },
  budget: {
    label: 'Budget',
    summary: 'Planned spend for the window, set in the campaign brief.',
    unit: 'currency',
  },
  impressions: {
    label: 'Impressions',
    summary: 'Ad views served — the raw reach denominator.',
    unit: 'count',
  },
  clicks: {
    label: 'Clicks',
    summary: 'Clicks on the ad creative — the engagement numerator for CTR.',
    unit: 'count',
  },
  landing_page_views: {
    label: 'LP Views',
    summary: 'Sessions where the landing page actually rendered. Tracks the gap between clicks and arrivals.',
    unit: 'count',
  },
  engaged_visits: {
    label: 'Engaged Visits',
    summary: 'Visits that crossed an engagement threshold (scroll depth, dwell, multi-page). Closest thing to a soft conversion.',
    unit: 'count',
  },
  completed_views: {
    label: 'Completed Views',
    summary: 'Video views played to completion (used by VCR). Only meaningful for video creative.',
    unit: 'count',
  },
  ctr: {
    label: 'CTR',
    summary: 'Click-through rate — clicks per impression.',
    formula: 'clicks ÷ impressions',
    unit: 'percent',
  },
  cvr: {
    label: 'CVR',
    summary: 'Conversion rate from clicks to engaged visits.',
    formula: 'engaged_visits ÷ clicks',
    unit: 'percent',
  },
  vcr: {
    label: 'VCR',
    summary: 'Video completion rate — completed views per impression.',
    formula: 'completed_views ÷ impressions',
    unit: 'percent',
    notes: 'Only meaningful for video placements; static creative shows VCR ≈ 0.',
  },
  cpm: {
    label: 'CPM',
    summary: 'Cost per thousand impressions — efficiency of reach.',
    formula: '1000 × spend ÷ impressions',
    unit: 'currency',
    betterLower: true,
  },
  cpc: {
    label: 'CPC',
    summary: 'Average cost per click — efficiency of click delivery.',
    formula: 'spend ÷ clicks',
    unit: 'currency',
    betterLower: true,
  },
  cpa: {
    label: 'CPA',
    summary: 'Cost per engaged visit — efficiency of the bottom-funnel action this dataset measures.',
    formula: 'spend ÷ engaged_visits',
    unit: 'currency',
    betterLower: true,
  },
};

export const DIMENSION_DEFINITIONS: Record<string, MetricDefinition> = {
  publisher: {
    label: 'Publisher',
    summary: 'The vendor that served the impression (Meta, Google, Amazon, …).',
  },
  platform: {
    label: 'Platform',
    summary: 'Device / surface bucket (mobile web, app, CTV, …) the impression landed on.',
  },
  campaign_phase: {
    label: 'Campaign Phase',
    summary: 'Workstream tag — Launch / In-flight / Always-on. Used to compare paid moments vs. evergreen.',
  },
  market_group: {
    label: 'Market Group',
    summary: 'Geographic rollup (e.g. NA-US, EMEA-DACH) the spend was attributed to.',
  },
  creative_format: {
    label: 'Creative Format',
    summary: 'Asset shape — Static / Video / Carousel / etc.',
  },
  kpi_goal: {
    label: 'KPI Goal',
    summary: 'The objective this line item was bought against (Awareness / Engagement / Conversion).',
  },
};

export function getMetricDefinition(
  key: string,
  overrides?: Record<string, Partial<MetricDefinition>>,
): MetricDefinition | undefined {
  const base = METRIC_DEFINITIONS[key] ?? DIMENSION_DEFINITIONS[key];
  if (!base) return undefined;
  const ov = overrides?.[key];
  return ov ? { ...base, ...ov } : base;
}
