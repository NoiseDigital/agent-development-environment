// Tile registry — the ONE place a tile.type maps to a renderer.
//
// Why a registry rather than a switch ladder in DashboardCanvas:
//   • Adding a tile type is one entry here + one entry in the type union
//     (data/dashboards/types.ts). DashboardCanvas never changes.
//   • Per-dashboard customizations layer cleanly: each renderer reads
//     PresentationOverrides (title / valueFormat / accent / subtitle)
//     merged from `dashboard.defaults` → `tile.presentation` → tile fields.
//   • No more "moving the kebab broke the layout" failure modes — the
//     grid wiring lives in DashboardCanvas and is decoupled from the
//     contents of any individual tile.
//
// See ./README.md for: how to add a tile type, how to customize per
// dashboard without forking the shared components.
//
// Note: tile component files live one level up
// (`components/dashboards/*Tile.tsx`) so existing imports across the
// codebase don't break. The registry is the canonical dispatch — direct
// imports of those components from outside `dashboards/` should be
// avoided in new code.

import type { ReactNode } from 'react';
import type { DashboardTile, PresentationOverrides } from '../../../data/dashboards/types';
import VegaChart from '../../VegaChart';
import KpiTile from './KpiTile';
import TrendTile from './TrendTile';
import BreakdownTile from './BreakdownTile';
import PivotTile from './PivotTile';
import QuadrantTile from './QuadrantTile';
import ParetoTile from './ParetoTile';
import PacingTile from './PacingTile';
import CorrelationHeatmapTile from './CorrelationHeatmapTile';
import NarrativeTile from './NarrativeTile';
import TextTile from './TextTile';

export interface TileRenderContext {
  /** Edit-mode flag — passed through to interactive tiles (TextTile etc.) */
  editing: boolean;
  /** Merged presentation overrides:
   *  `dashboard.defaults` ← `tile.presentation`. Renderers should reach
   *  for `overrides.title` etc. before falling back to their own spec
   *  fields. The merge happens once in DashboardCanvas — renderers don't
   *  need to repeat it. */
  overrides: PresentationOverrides;
  /** Text-tile inline editing handler. */
  onTextChange: (id: string, text: string) => void;
}

type Renderer<T extends DashboardTile['type']> = (
  tile: Extract<DashboardTile, { type: T }>,
  ctx: TileRenderContext,
) => ReactNode;

/** The canonical tile-type → renderer map. Adding a tile type means:
 *    1. Add the literal to `TileType` and a `<X>TileSpec` in
 *       `src/data/dashboards/types.ts`.
 *    2. Add an entry below. That's the entire wiring. */
export const TILE_RENDERERS: { [K in DashboardTile['type']]: Renderer<K> } = {
  chart: (tile) => <VegaChart spec={tile.chart} fill />,
  kpi: (tile, { overrides }) => (
    <KpiTile
      label={overrides.title ?? tile.label}
      metric={tile.metric}
      format={tile.format}
      betterLower={tile.betterLower}
    />
  ),
  trend: (tile, { overrides }) => (
    <TrendTile
      title={overrides.title ?? tile.title}
      metric={tile.metric}
      secondaryMetric={tile.secondaryMetric}
    />
  ),
  pivot: (tile, { overrides }) => (
    <PivotTile
      title={overrides.title ?? tile.title}
      outerDim={tile.outerDim}
      innerDim={tile.innerDim}
      rowHeader={tile.rowHeader}
      columns={tile.columns}
    />
  ),
  breakdown: (tile, { overrides }) => (
    <BreakdownTile
      title={overrides.title ?? tile.title}
      source={tile.source}
      metric={tile.metric}
      valueFormat={tile.valueFormat}
    />
  ),
  quadrant: (tile, { overrides }) => (
    <QuadrantTile
      title={overrides.title ?? tile.title}
      dim={tile.dim}
      xMetric={tile.xMetric}
      yMetric={tile.yMetric}
      sizeMetric={tile.sizeMetric}
    />
  ),
  pareto: (tile, { overrides }) => (
    <ParetoTile
      title={overrides.title ?? tile.title}
      source={tile.source}
      metric={tile.metric}
      valueFormat={tile.valueFormat}
      topN={tile.topN}
    />
  ),
  pacing: (tile, { overrides }) => (
    <PacingTile title={overrides.title ?? tile.title} expectedShare={tile.expectedShare} />
  ),
  heatmap: (tile, { overrides }) => (
    <CorrelationHeatmapTile title={overrides.title ?? tile.title} />
  ),
  narrative: (tile, { overrides }) => (
    <NarrativeTile title={overrides.title ?? tile.title} />
  ),
  text: (tile, { editing, onTextChange }) => (
    <TextTile text={tile.text} editing={editing} onChange={(text) => onTextChange(tile.id, text)} />
  ),
};

/** Dispatch a tile to its renderer. Falls back to a placeholder for
 *  unknown types so a stale dashboard config doesn't crash the canvas. */
export function renderTile(tile: DashboardTile, ctx: TileRenderContext): ReactNode {
  // The cast is safe in practice — TILE_RENDERERS is keyed on every
  // member of the union — but TS's narrowing here is awkward, so we
  // bridge with the renderer type.
  const renderer = TILE_RENDERERS[tile.type] as Renderer<typeof tile.type>;
  if (!renderer) {
    console.warn('[tiles] no renderer for tile type', tile.type, tile);
    return <UnknownTilePlaceholder type={tile.type} />;
  }
  return renderer(tile as never, ctx);
}

function UnknownTilePlaceholder({ type }: { type: string }) {
  return (
    <div className="flex h-full items-center justify-center text-[11px] text-zinc-500">
      Unknown tile type: <code className="ml-1">{type}</code>
    </div>
  );
}

/** Merge a dashboard's defaults with one tile's per-instance overrides.
 *  Per-tile beats per-dashboard. Both are optional — the empty object is
 *  fine and means "no overrides applied". */
export function mergeOverrides(
  dashboardDefaults: PresentationOverrides | undefined,
  tileOverrides: PresentationOverrides | undefined,
): PresentationOverrides {
  return { ...(dashboardDefaults ?? {}), ...(tileOverrides ?? {}) };
}
