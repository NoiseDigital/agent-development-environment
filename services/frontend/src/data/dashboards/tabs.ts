// Tab compositions — the reference "what does a goal tab look like" and
// "what does the Insights tab look like" assemblies, built out of the
// per-block builders. Client dashboards either use these directly (the
// common case — every NOI tab is just `buildGoalTab(prefix, kind)`) or
// copy the composition into their own client file and tweak.

import type { DashboardTab, DashboardTile, TabKind } from './types';
import { GOAL_TABS } from './primitives';
import {
  correlationHeatmap,
  dimensionBreakdown,
  efficiencyQuadrant,
  kpiStrip,
  kpisFor,
  nestedPivot,
  pacingBlock,
  paretoBlock,
  trendHero,
} from './builders';

/** A canonical goal tab — KPI strip, hero dual-axis trend + narrative,
 *  pacing card, publisher breakdown, publisher×phase pivot. The five
 *  blocks reusing the same prefix means tile ids are stable + globally
 *  unique within the dashboard. */
export function buildGoalTab(prefix: string, kind: TabKind): DashboardTile[] {
  const kpis = kpiStrip(prefix, kpisFor(kind));
  const { trend, narrative } = trendHero(prefix, kind);
  const pacing = pacingBlock(prefix);
  const publisherBreakdown = dimensionBreakdown(prefix, {
    title: 'Spend by Publisher',
    source: 'publisher',
  });
  const pivot = nestedPivot(prefix, {
    title: 'Performance by Publisher',
    outerDim: 'publisher',
    innerDim: 'campaign_phase',
    rowHeader: 'Publisher / Phase',
  });
  return [...kpis, trend, narrative, pacing, publisherBreakdown, pivot];
}

/** Insights tab — analytical visuals that surface "where to lean in / where
 *  to pivot" rather than the bread-and-butter spend/impression slices on
 *  the goal tabs. Reuses the Overall KPI strip so the reader doesn't lose
 *  context when switching to this tab. */
export function buildInsightsTab(prefix: string): DashboardTile[] {
  const kpis = kpiStrip(prefix, kpisFor('overall'));
  const quadrantPub = efficiencyQuadrant(prefix, {
    title: 'Publisher efficiency — CPC × CTR (sized by spend)',
    dim: 'publisher',
    layout: { x: 0, y: 2, w: 6, h: 9 },
  });
  const quadrantFmt = efficiencyQuadrant(prefix, {
    title: 'Creative format efficiency — CPC × CTR',
    dim: 'creative_format',
    layout: { x: 6, y: 2, w: 6, h: 9 },
  });
  // Per-campaign performance matrix — same primitive as the publisher
  // quadrant but at the campaign level, which is the unit a planner can
  // actually act on (pause / scale / re-flight). Sized by spend so small
  // experiments don't drown out flagship campaigns.
  const quadrantCampaign = efficiencyQuadrant(prefix, {
    title: 'Campaign performance matrix — CPC × CTR',
    dim: 'campaign',
    layout: { x: 0, y: 11, w: 12, h: 9 },
  });
  const paretoPub = paretoBlock(prefix, {
    title: 'Spend concentration — top publishers',
    source: 'publisher',
    layout: { x: 0, y: 20, w: 6, h: 8 },
  });
  const paretoMkt = paretoBlock(prefix, {
    title: 'Spend concentration — markets',
    source: 'market_group',
    layout: { x: 6, y: 20, w: 6, h: 8 },
  });
  const heatmap = correlationHeatmap(prefix, { baseY: 28 });
  return [...kpis, quadrantPub, quadrantFmt, quadrantCampaign, paretoPub, paretoMkt, heatmap];
}

/** The default tab assembly — four goal tabs + an Insights tab. Most
 *  client dashboards use this directly via `dashboardId` as the prefix. */
export function buildStandardTabs(prefix: string): DashboardTab[] {
  return [
    ...GOAL_TABS.map((t) => ({
      id: t.id,
      label: t.label,
      tiles: buildGoalTab(`${prefix}-${t.id}`, t.kind),
    })),
    {
      id: 'insights',
      label: 'Insights',
      tiles: buildInsightsTab(`${prefix}-insights`),
    },
  ];
}
