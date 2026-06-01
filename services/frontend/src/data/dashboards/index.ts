// Public surface of the dashboards-as-code layer. Every consumer outside
// this folder should import from here — `data/dashboards` reads cleanly,
// and the internal files (types, primitives, builders, tabs, clients) can
// move around behind this barrel without breaking imports.
//
// The layered structure inside this folder:
//   • types.ts        — tile + dashboard model (shapes only)
//   • primitives.ts   — shared palette (KPI sets, trend pairs, pivot cols)
//   • builders.ts     — per-block tile builders (LEGO bricks)
//   • tabs.ts         — reference tab compositions (goal-tab, insights-tab)
//   • clients/        — one file per client dashboard definition
//   • user-dashboards.ts — hydrator for user-created dashboards
//
// Workflow for adding a new client dashboard:
//   1. Copy `clients/noi.ts` to `clients/<code>.ts`.
//   2. Edit the seed (id MUST be the uppercase client code).
//   3. Add the new dashboard to `clients/index.ts`.
//   4. Add the code to `data/client-codes.ts`.
//   5. Ensure the client exists in `data/clients.ts`.
//   6. Done — `/dashboards/<CODE>` works, tile rendering is shared.

// Types — everything a renderer or agent layer needs to know.
export type {
  ChartTile,
  Dashboard,
  DashboardOwnership,
  DashboardTab,
  DashboardTile,
  GridPos,
  HeatmapTileSpec,
  KpiDelta,
  KpiTileSpec,
  NarrativeTileSpec,
  PacingTileSpec,
  ParetoTileSpec,
  PivotTileSpec,
  PresentationOverrides,
  QuadrantTileSpec,
  TabKind,
  TextTile,
  TileType,
  TrendTileSpec,
  BreakdownTileSpec,
} from './types';

// Composition primitives — exported so an admin tool or a one-off script
// can introspect them. Most consumers don't need these.
export { GOAL_TABS, KPI_SETS, PIVOT_COLUMNS, TREND_PAIRS } from './primitives';
export type { KpiConfig, TrendPair } from './primitives';

// Tile + tab builders — for code-defining a bespoke client dashboard.
export {
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
export {
  buildGoalTab,
  buildInsightsTab,
  buildStandardTabs,
} from './tabs';

// Hydrator for user-created dashboards.
export { dashboardFromSpec } from './user-dashboards';

// The registry of code-defined client dashboards. This replaces the old
// `mockDashboards` export — same shape, clearer name (and no more
// "mock", which lied: these are the canonical client dashboards).
import { clientDashboards } from './clients';
import type { Dashboard } from './types';

export { clientDashboards };

/** @deprecated Prefer `clientDashboards`. Kept for one migration cycle so
 *  callers that haven't updated their imports still resolve. */
export const mockDashboards: Dashboard[] = clientDashboards;
