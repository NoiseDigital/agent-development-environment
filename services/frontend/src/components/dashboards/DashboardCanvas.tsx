'use client';

import { useRef } from 'react';
import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout';
import { GridBackground } from 'react-grid-layout/extras';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import type { DashboardTile, PresentationOverrides } from '../../data/dashboards';
import type { VegaSpec } from '../../types/genui';
import ChartActions from '../ChartActions';
import { renderTile, mergeOverrides } from './tiles';

// Shared grid metrics — must stay in sync between the layout and its background.
const COLS = 12;
const ROW_HEIGHT = 40;
const MARGIN: [number, number] = [16, 16];

interface DashboardCanvasProps {
  tiles: DashboardTile[];
  editing: boolean;
  /** Dashboard-level presentation defaults applied to every tile as a
   *  fallback. Per-tile `presentation` wins where both are set. */
  dashboardDefaults?: PresentationOverrides;
  onLayoutChange: (layout: Layout) => void;
  onTextChange: (id: string, text: string) => void;
  onRemoveTile: (id: string) => void;
}

export default function DashboardCanvas({
  tiles,
  editing,
  dashboardDefaults,
  onLayoutChange,
  onTextChange,
  onRemoveTile,
}: DashboardCanvasProps) {
  const { width, containerRef, mounted } = useContainerWidth();

  const layout: Layout = tiles.map((t) => ({
    i: t.id,
    x: t.layout.x,
    y: t.layout.y,
    w: t.layout.w,
    h: t.layout.h,
    minW: t.layout.minW,
    minH: t.layout.minH,
  }));

  // Keep the edit-mode grid background tall enough to sit behind every tile.
  const rows =
    tiles.reduce((max, t) => Math.max(max, t.layout.y + t.layout.h), 0) + (editing ? 4 : 0);

  return (
    <div ref={containerRef} className="relative">
      {mounted && (
        <>
          {editing && (
            <GridBackground
              width={width}
              cols={COLS}
              rowHeight={ROW_HEIGHT}
              margin={MARGIN}
              rows={rows}
              color="rgba(255,255,255,0.035)"
              borderRadius={8}
            />
          )}

          <GridLayout
            width={width}
            layout={layout}
            onLayoutChange={onLayoutChange}
            gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN }}
            dragConfig={{ enabled: editing, cancel: '.no-drag' }}
            resizeConfig={{ enabled: editing, handles: ['se'] }}
          >
            {/* IMPORTANT — react-grid-layout positions its IMMEDIATE child via
                cloneElement(style/className). The literal `<div key={tile.id}>`
                MUST be that immediate child, or the grid silently drops its
                positioning and every tile collapses to 0 height. Don't extract
                this <div> into a component — keep the body inside `TileBody`. */}
            {tiles.map((tile) => (
              <div key={tile.id} className="group/tile relative">
                <TileBody
                  tile={tile}
                  editing={editing}
                  dashboardDefaults={dashboardDefaults}
                  onRemoveTile={onRemoveTile}
                  onTextChange={onTextChange}
                />
              </div>
            ))}
          </GridLayout>
        </>
      )}
    </div>
  );
}

interface TileBodyProps {
  tile: DashboardTile;
  editing: boolean;
  dashboardDefaults?: PresentationOverrides;
  onRemoveTile: (id: string) => void;
  onTextChange: (id: string, text: string) => void;
}

/** Per-tile body + the unified kebab. Rendered INSIDE the
 *  `<div key={tile.id}>` that react-grid-layout positions — not as a
 *  replacement for it (see the IMPORTANT note above).
 *
 *  Dispatch goes through the tile registry in `./tiles`. Every tile type
 *  receives merged presentation overrides (dashboard defaults ← per-tile
 *  presentation). The kebab in the top-right corner is the SAME pixel slot
 *  on every tile and its menu adapts to what the tile supports. */
function TileBody({
  tile,
  editing,
  dashboardDefaults,
  onRemoveTile,
  onTextChange,
}: TileBodyProps) {
  const tileRef = useRef<HTMLDivElement | null>(null);
  const chartSpec: VegaSpec | undefined = tile.type === 'chart' ? tile.chart : undefined;
  const overrides = mergeOverrides(dashboardDefaults, tile.presentation);
  const fallbackTitle = overrides.title ?? tileTitle(tile);
  return (
    <>
      <div
        ref={tileRef}
        className={`h-full rounded-xl border bg-zinc-900 p-3 overflow-hidden transition-colors ${
          editing ? 'border-zinc-700 cursor-move' : 'border-zinc-800'
        }`}
      >
        {renderTile(tile, { editing, overrides, onTextChange })}
      </div>

      {/* Unified kebab: same pixel position on every tile type. */}
      <div className="no-drag absolute right-1.5 top-1.5 z-20 opacity-0 transition group-hover/tile:opacity-100">
        <ChartActions
          captureRef={tileRef}
          chart={chartSpec}
          fallbackTitle={fallbackTitle}
          exportsOnly
          onDelete={editing ? () => onRemoveTile(tile.id) : undefined}
        />
      </div>
    </>
  );
}

/** PNG filename + flag-dialog label for any tile type when no presentation
 *  override supplies one. Reaches for the tile's own title / label first. */
function tileTitle(tile: DashboardTile): string {
  if ('title' in tile && typeof tile.title === 'string' && tile.title) return tile.title;
  if (tile.type === 'kpi') return tile.label;
  if (tile.type === 'text') return 'note';
  return 'visual';
}
