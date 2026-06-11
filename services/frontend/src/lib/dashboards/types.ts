// Dashboard model — the single source of truth for tile / tab / dashboard
// shapes. Both the legacy mock dashboard pipeline AND the BQ-backed pipeline
// consume these types; renderers stay agnostic to where the data came from.

import type { VegaSpec } from '../../types/genui';

// ── Tile primitives ──────────────────────────────────────────────────────────

export type TileType = 'chart' | 'text' | 'kpi' | 'pivot' | 'narrative';

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
  /** A Vega-Lite spec — rendered by VegaChart. */
  chart: VegaSpec;
}

export interface TextTile extends BaseTile {
  type: 'text';
  text: string;
}

/** A change indicator on a KPI card — `good` drives the colour, independent
 *  of sign (a falling CPC is good). */
export interface KpiDelta {
  value: string;
  good: boolean;
}

export interface KpiTile extends BaseTile {
  type: 'kpi';
  label: string;
  value: string;
  delta?: KpiDelta;
  sublabel?: string;
  /** Optional per-KPI sparkline points (oldest → newest). When present the
   *  card draws a tiny inline trend line tinted to match the delta sign. */
  sparkline?: number[];
}

export interface PivotColumn {
  key: string;
  label: string;
}

export interface PivotRow {
  label: string;
  values: Record<string, string>;
  /** Row-level trend (spend, recent vs prior half) — top-level rows only. */
  delta?: KpiDelta;
  children?: PivotRow[];
}

export interface PivotTile extends BaseTile {
  type: 'pivot';
  title: string;
  rowHeader: string;
  columns: PivotColumn[];
  rows: PivotRow[];
  total: PivotRow;
}

/** An agent-written summary panel — the "powered by Noise" insight layer. */
export interface NarrativeTile extends BaseTile {
  type: 'narrative';
  title: string;
  points: string[];
}

export type DashboardTile =
  | ChartTile
  | TextTile
  | KpiTile
  | PivotTile
  | NarrativeTile;

// ── Dashboard ────────────────────────────────────────────────────────────────

export type DashboardOwnership = 'owned' | 'shared' | 'client';

export interface DashboardTab {
  id: string;
  label: string;
  tiles: DashboardTile[];
}

export interface Dashboard {
  id: string;
  name: string;
  client: string;
  clientInitials: string;
  owner: string;
  ownership: DashboardOwnership;
  lastUpdated: string;
  description: string;
  accentColor: string;
  filters: string[];
  /** The campaign whose ad lines + performance this dashboard reports on. */
  campaignId: string;
  tabs: DashboardTab[];
}
