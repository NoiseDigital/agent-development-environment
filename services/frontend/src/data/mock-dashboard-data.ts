import { ChartData } from '../types/chart';

export type DashboardOwnership = 'owned' | 'shared' | 'client';

// ── Tile model ────────────────────────────────────────────────────────────────
// A dashboard is a set of tiles laid out on a hidden 12-column grid. Each tile
// carries its own grid position so layouts can be dragged, resized, and saved.

export type TileType = 'chart' | 'text';

export interface GridPos {
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

interface BaseTile {
  id: string;
  layout: GridPos;
}

export interface ChartTile extends BaseTile {
  type: 'chart';
  chart: ChartData;
}

export interface TextTile extends BaseTile {
  type: 'text';
  text: string;
}

export type DashboardTile = ChartTile | TextTile;

export interface Dashboard {
  id: string;
  name: string;
  client: string;
  clientInitials: string;
  owner: string;
  ownership: DashboardOwnership;
  lastUpdated: string;
  description: string;
  tiles: DashboardTile[];
}

// Default grid placement for a dashboard built from the standard 4-chart set.
// Index 3 (the funnel) spans the full width.
const CHART_POSITIONS: GridPos[] = [
  { x: 0, y: 2, w: 6, h: 9, minW: 3, minH: 5 },
  { x: 6, y: 2, w: 6, h: 9, minW: 3, minH: 5 },
  { x: 0, y: 11, w: 6, h: 9, minW: 3, minH: 5 },
  { x: 0, y: 20, w: 12, h: 9, minW: 4, minH: 5 },
];

function buildTiles(prefix: string, headline: string, charts: ChartData[]): DashboardTile[] {
  const textTile: TextTile = {
    id: `${prefix}-text-0`,
    type: 'text',
    text: headline,
    layout: { x: 0, y: 0, w: 12, h: 2, minW: 2, minH: 1 },
  };
  const chartTiles: ChartTile[] = charts.map((chart, i) => ({
    id: `${prefix}-chart-${i}`,
    type: 'chart',
    chart,
    layout: CHART_POSITIONS[i] ?? { x: 0, y: 29 + i * 9, w: 6, h: 9, minW: 3, minH: 5 },
  }));
  return [textTile, ...chartTiles];
}

// ── Horizon Auto Group ────────────────────────────────────────────────────────

const horizonCharts: ChartData[] = [
  {
    type: 'line',
    title: 'Impressions & Spend Over Time',
    insight: 'Impressions peaked in mid-April aligned with the EV launch push. Spend efficiency improved week-over-week as DV360 optimised toward viewable placements.',
    data: [
      { name: 'Apr W1', Impressions: 1_820_000, Spend: 18_200 },
      { name: 'Apr W2', Impressions: 2_650_000, Spend: 24_500 },
      { name: 'Apr W3', Impressions: 3_100_000, Spend: 28_900 },
      { name: 'Apr W4', Impressions: 2_980_000, Spend: 27_400 },
      { name: 'May W1', Impressions: 2_540_000, Spend: 22_800 },
      { name: 'May W2', Impressions: 2_710_000, Spend: 21_600 },
      { name: 'May W3', Impressions: 2_430_000, Spend: 19_900 },
    ],
  },
  {
    type: 'bar',
    title: 'Spend by Platform',
    insight: 'DV360 accounts for 46% of total spend, reflecting the programmatic-first strategy. Meta and Google Ads together drive the majority of click volume.',
    data: [
      { name: 'DV360', value: 106_770 },
      { name: 'Meta', value: 29_925 },
      { name: 'Google Ads', value: 38_200 },
      { name: 'The Trade Desk', value: 24_920 },
    ],
  },
  {
    type: 'line',
    title: 'CTR by Platform (%)',
    insight: 'Google Ads Search drives a 5.0% CTR, far outpacing display formats. Meta native CTR of 1.2% is above category benchmarks for auto.',
    data: [
      { name: 'Apr W1', 'Google Ads': 4.8, 'Meta': 1.0, 'DV360': 0.3 },
      { name: 'Apr W2', 'Google Ads': 5.1, 'Meta': 1.2, 'DV360': 0.35 },
      { name: 'Apr W3', 'Google Ads': 5.3, 'Meta': 1.25, 'DV360': 0.4 },
      { name: 'Apr W4', 'Google Ads': 5.0, 'Meta': 1.18, 'DV360': 0.38 },
      { name: 'May W1', 'Google Ads': 4.9, 'Meta': 1.22, 'DV360': 0.42 },
      { name: 'May W2', 'Google Ads': 5.2, 'Meta': 1.3, 'DV360': 0.4 },
    ],
  },
  {
    type: 'funnel',
    title: 'Conversion Funnel — Q2 2025',
    insight: 'The funnel shows healthy top-of-funnel reach. The Click → Visit drop (35%) suggests landing page friction — an A/B test on the EV page CTA is recommended.',
    data: [
      { name: 'Impressions', value: 18_810_000, fill: '#1976D2' },
      { name: 'Viewable Impr.', value: 12_227_000, fill: '#2196F3' },
      { name: 'Clicks', value: 111_340, fill: '#42A5F5' },
      { name: 'Site Visits', value: 72_370, fill: '#64B5F6' },
      { name: 'Lead Forms', value: 8_680, fill: '#90CAF9' },
    ],
  },
];

// ── Bloom & Co. ───────────────────────────────────────────────────────────────

const bloomCharts: ChartData[] = [
  {
    type: 'line',
    title: 'Impressions & Spend Over Time',
    insight: 'Strong delivery across the spring launch window with spend pacing tightly to plan. Impressions tapered naturally as the flight closed in mid-May.',
    data: [
      { name: 'Mar W2', Impressions: 980_000, Spend: 9_800 },
      { name: 'Mar W3', Impressions: 1_540_000, Spend: 14_200 },
      { name: 'Mar W4', Impressions: 1_820_000, Spend: 16_900 },
      { name: 'Apr W1', Impressions: 1_680_000, Spend: 15_400 },
      { name: 'Apr W2', Impressions: 1_420_000, Spend: 13_200 },
      { name: 'Apr W3', Impressions: 1_180_000, Spend: 10_980 },
      { name: 'May W1', Impressions: 850_000, Spend: 7_400 },
      { name: 'May W2', Impressions: 384_000, Spend: 3_112 },
    ],
  },
  {
    type: 'pie',
    title: 'Spend by Platform',
    insight: 'Meta (Instagram Stories) captured the largest share at 47%, consistent with the audience-first brief targeting women 25–44 in urban centres.',
    data: [
      { name: 'Meta', value: 29_988 },
      { name: 'The Trade Desk', value: 19_994 },
      { name: 'Google Ads', value: 14_998 },
    ],
  },
  {
    type: 'line',
    title: 'CTR by Platform (%)',
    insight: 'Meta Stories drove the highest engagement at 1.8% CTR on peak weeks — well above the 0.9% beauty industry benchmark.',
    data: [
      { name: 'Mar W2', 'Meta': 1.4, 'The Trade Desk': 0.8, 'Google Ads': 0.9 },
      { name: 'Mar W3', 'Meta': 1.7, 'The Trade Desk': 0.95, 'Google Ads': 0.95 },
      { name: 'Mar W4', 'Meta': 1.9, 'The Trade Desk': 1.1, 'Google Ads': 1.1 },
      { name: 'Apr W1', 'Meta': 1.8, 'The Trade Desk': 1.05, 'Google Ads': 1.05 },
      { name: 'Apr W2', 'Meta': 1.6, 'The Trade Desk': 0.95, 'Google Ads': 1.0 },
    ],
  },
  {
    type: 'funnel',
    title: 'Conversion Funnel — Spring Launch',
    insight: 'Retargeting display drove a disproportionate share of product page visits, confirming the lower-funnel value of the Google Ads line.',
    data: [
      { name: 'Impressions', value: 10_854_000, fill: '#1976D2' },
      { name: 'Viewable Impr.', value: 7_598_000, fill: '#2196F3' },
      { name: 'Clicks', value: 132_060, fill: '#42A5F5' },
      { name: 'Product Views', value: 79_236, fill: '#64B5F6' },
      { name: 'Purchases', value: 6_339, fill: '#90CAF9' },
    ],
  },
];

// ── NorthEdge Financial ───────────────────────────────────────────────────────

const northEdgeCharts: ChartData[] = [
  {
    type: 'line',
    title: 'Impressions & Spend Over Time',
    insight: 'LinkedIn pacing is front-loaded to capture mortgage decision-makers before end-of-quarter. Google Ads spend is stabilising around $8K/week.',
    data: [
      { name: 'Apr W1', Impressions: 620_000, Spend: 28_600 },
      { name: 'Apr W2', Impressions: 710_000, Spend: 32_100 },
      { name: 'Apr W3', Impressions: 680_000, Spend: 30_800 },
      { name: 'Apr W4', Impressions: 650_000, Spend: 29_400 },
      { name: 'May W1', Impressions: 590_000, Spend: 27_200 },
      { name: 'May W2', Impressions: 610_000, Spend: 27_860 },
    ],
  },
  {
    type: 'bar',
    title: 'Spend by Platform',
    insight: 'LinkedIn dominates spend at 34% due to its premium CPM in the financial services segment, but delivers the highest quality leads by volume.',
    data: [
      { name: 'LinkedIn', value: 46_200 },
      { name: 'Google Ads', value: 53_760 },
      { name: 'DV360', value: 35_000 },
    ],
  },
  {
    type: 'line',
    title: 'CTR by Platform (%)',
    insight: 'Google Ads Search maintains an 8% CTR on branded terms — best-in-class for financial services. LinkedIn CTR of 1% meets benchmark for B2C mortgage campaigns.',
    data: [
      { name: 'Apr W1', 'Google Ads': 7.8, 'LinkedIn': 0.95, 'DV360': 0.65 },
      { name: 'Apr W2', 'Google Ads': 8.1, 'LinkedIn': 1.0, 'DV360': 0.70 },
      { name: 'Apr W3', 'Google Ads': 8.3, 'LinkedIn': 1.05, 'DV360': 0.72 },
      { name: 'Apr W4', 'Google Ads': 8.0, 'LinkedIn': 0.98, 'DV360': 0.68 },
      { name: 'May W1', 'Google Ads': 7.9, 'LinkedIn': 1.02, 'DV360': 0.71 },
    ],
  },
  {
    type: 'funnel',
    title: 'Lead Generation Funnel — Q2 2025',
    insight: 'Form completion rate of 28% on mortgage leads is strong. Focus on reducing drop-off between Rate Calculator page view and form start.',
    data: [
      { name: 'Impressions', value: 7_630_000, fill: '#1976D2' },
      { name: 'Clicks', value: 77_150, fill: '#2196F3' },
      { name: 'Landing Page', value: 54_005, fill: '#42A5F5' },
      { name: 'Form Start', value: 16_200, fill: '#64B5F6' },
      { name: 'Form Complete', value: 4_536, fill: '#90CAF9' },
    ],
  },
];

// ── Dashboard registry ────────────────────────────────────────────────────────

export const mockDashboards: Dashboard[] = [
  {
    id: 'dash-1',
    name: 'Horizon Auto — Q2 2025 Performance',
    client: 'Horizon Auto Group',
    clientInitials: 'HA',
    owner: 'You',
    ownership: 'owned',
    lastUpdated: '2025-05-12',
    description: 'Full-funnel view across all paid channels for the Q2 Brand Awareness and Summer Sales campaigns.',
    tiles: buildTiles(
      'dash-1',
      'Q2 2025 Performance Overview — full-funnel results across every paid channel for the Brand Awareness and Summer Sales campaigns. Drag any tile to rearrange; resize from the bottom-right corner.',
      horizonCharts,
    ),
  },
  {
    id: 'dash-2',
    name: 'Bloom & Co — Spring Launch Recap',
    client: 'Bloom & Co.',
    clientInitials: 'BC',
    owner: 'You',
    ownership: 'owned',
    lastUpdated: '2025-05-10',
    description: 'Post-campaign analysis of the Spring Collection launch across Meta, Pinterest, and Google Ads.',
    tiles: buildTiles(
      'dash-2',
      'Spring Launch Recap — post-campaign analysis of the Spring Collection rollout across Meta, Pinterest, and Google Ads.',
      bloomCharts,
    ),
  },
  {
    id: 'dash-3',
    name: 'NorthEdge — Mortgage Q2 Live',
    client: 'NorthEdge Financial',
    clientInitials: 'NF',
    owner: 'Sarah K.',
    ownership: 'shared',
    lastUpdated: '2025-05-13',
    description: 'Live performance view of the Mortgage Rates Q2 campaign across LinkedIn, Google Ads, and DV360.',
    tiles: buildTiles(
      'dash-3',
      'Mortgage Q2 Live — real-time performance of the Mortgage Rates campaign across LinkedIn, Google Ads, and DV360.',
      northEdgeCharts,
    ),
  },
  {
    id: 'dash-4',
    name: 'Horizon Auto — Client Report May',
    client: 'Horizon Auto Group',
    clientInitials: 'HA',
    owner: 'Marcus T.',
    ownership: 'client',
    lastUpdated: '2025-05-08',
    description: 'Client-facing monthly report for Horizon Auto Group. Simplified view with exec summary metrics.',
    tiles: buildTiles(
      'dash-4',
      'Client Report — May — simplified monthly summary for Horizon Auto Group with exec-level headline metrics.',
      horizonCharts,
    ),
  },
];
