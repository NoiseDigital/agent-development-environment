'use client';

import { GridLayout, useContainerWidth, type Layout } from 'react-grid-layout';
import { GridBackground } from 'react-grid-layout/extras';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import { DashboardTile } from '../data/mockDashboardData';
import ChartVisualization from './ChartVisualization';
import TextTile from './TextTile';

// Shared grid metrics — must stay in sync between the layout and its background.
const COLS = 12;
const ROW_HEIGHT = 40;
const MARGIN: [number, number] = [16, 16];

interface DashboardCanvasProps {
  tiles: DashboardTile[];
  editing: boolean;
  onLayoutChange: (layout: Layout) => void;
  onTextChange: (id: string, text: string) => void;
  onRemoveTile: (id: string) => void;
}

export default function DashboardCanvas({
  tiles,
  editing,
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
            {tiles.map((tile) => (
              <div key={tile.id} className="group/tile">
                <div
                  className={`h-full rounded-xl border bg-zinc-900 p-4 overflow-hidden transition-colors ${
                    editing ? 'border-zinc-700 cursor-move' : 'border-zinc-800'
                  }`}
                >
                  {tile.type === 'chart' ? (
                    <ChartVisualization
                      type={tile.chart.type}
                      data={tile.chart.data}
                      title={tile.chart.title}
                      fill
                    />
                  ) : (
                    <TextTile
                      text={tile.text}
                      editing={editing}
                      onChange={(text) => onTextChange(tile.id, text)}
                    />
                  )}
                </div>

                {editing && (
                  <button
                    type="button"
                    onClick={() => onRemoveTile(tile.id)}
                    className="no-drag absolute top-2 right-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border border-zinc-700 bg-zinc-800 text-zinc-400 opacity-0 transition group-hover/tile:opacity-100 hover:border-red-500/40 hover:bg-red-500/20 hover:text-red-400"
                    aria-label="Remove tile"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </GridLayout>
        </>
      )}
    </div>
  );
}
