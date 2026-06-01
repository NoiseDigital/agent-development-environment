'use client';

// Vega-Lite renderer — the platform's one chart engine. There is no per-chart-
// type code: the `spec` IS the chart (a declarative grammar of mark + encoding
// + transform), and the Vega-Lite compiler does the rendering.
//
// Every spec is gated by checkVegaSpec first — the agent's chart vocabulary is
// bounded to an allowlist the platform owns. The renderer is loaded client-only
// (the Vega runtime touches the DOM).

import dynamic from 'next/dynamic';
import { useState, useRef, useEffect, type ComponentType } from 'react';
import type { VegaSpec } from '../types/genui';
import { vegaDarkTheme } from '../lib/charts/theme';
import { checkVegaSpec } from '../lib/charts/guard';
import { compactNum } from '../lib/compact-num';
import ChartActions from './ChartActions';

const VegaEmbed = dynamic(
  async () => {
    // Load react-vega and vega together so we can register the custom number
    // formatter on the same vega instance vega-embed will use to render.
    const [reactVega, vegaMod] = await Promise.all([
      import('react-vega'),
      import('vega'),
    ]);
    vegaMod.expressionFunction('compactNum', compactNum);
    return reactVega.VegaEmbed;
  },
  {
    ssr: false,
    loading: () => <div className="h-full min-h-[200px] w-full animate-pulse rounded-lg bg-surface-raised/40" />,
  },
) as unknown as ComponentType<{
  spec: VegaSpec;
  options?: Record<string, unknown>;
  onError?: (error: unknown) => void;
}>;

// Multi-view specs (facet / repeat / concat) size their own sub-views.
const MULTI_VIEW_KEYS = ['facet', 'repeat', 'concat', 'hconcat', 'vconcat', 'spec'];

function Fallback({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-[200px] w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-zinc-500">
      {message}
    </div>
  );
}

interface VegaChartProps {
  spec: VegaSpec;
  /** Fill the parent's height — for resizable dashboard tiles. */
  fill?: boolean;
  /** Render the chart-actions menu (save to dashboard, export). */
  saveable?: boolean;
}

export default function VegaChart({ spec, fill = false, saveable = false }: VegaChartProps) {
  const [error, setError] = useState<string | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Measure the container — Vega-Lite gets explicit numeric dimensions, which
  // render deterministically (unlike `width: 'container'`, which draws nothing
  // until the embed happens to observe a size).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const guard = checkVegaSpec(spec);
  if (!guard.ok) return <Fallback message={`Chart blocked — ${guard.reason}.`} />;

  const isMultiView = MULTI_VIEW_KEYS.some((k) => k in spec);
  // `fit` scales the whole chart — axes included — into the measured box. A
  // filled chart takes its height from the tile; otherwise the spec sets it.
  const sizing = isMultiView
    ? {}
    : fill
      ? { width: size.w, height: size.h, autosize: { type: 'fit', contains: 'padding' } }
      : { width: size.w, autosize: { type: 'fit', contains: 'padding' } };
  const themed: VegaSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: 'transparent',
    config: vegaDarkTheme,
    // A small top-level padding combined with autosize.contains:'padding'
    // guarantees title and axis labels never touch the edge of their container.
    padding: 8,
    ...spec,
    ...sizing,
  };
  const ready = isMultiView || (size.w > 0 && (!fill || size.h > 0));

  return (
    <div ref={containerRef} className={`vega-chart relative w-full ${fill ? 'h-full' : ''}`}>
      {error ? (
        <Fallback message={`Could not render chart: ${error}`} />
      ) : ready ? (
        <VegaEmbed
          spec={themed}
          options={{ actions: false, renderer: 'svg', tooltip: { theme: 'dark' } }}
          onError={(e) => setError(String(e))}
        />
      ) : (
        <div className="h-full min-h-[200px] w-full animate-pulse rounded-lg bg-surface-raised/40" />
      )}
      {saveable && !error && (
        <div className="absolute right-1 top-1 z-10">
          {/* Dashboard tiles (fill) show export-only — they're already on a dashboard. */}
          <ChartActions chart={spec} captureRef={containerRef} exportsOnly={fill} />
        </div>
      )}
    </div>
  );
}
