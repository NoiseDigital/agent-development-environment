'use client';

// Vega-Lite renderer — the whole thing. There is no per-chart-type code: the
// `spec` IS the chart (a declarative grammar of mark + encoding + transform),
// and the Vega-Lite compiler does the rendering.
//
// Every spec is gated by checkVegaSpec first — the agent's chart vocabulary is
// bounded to an allowlist the platform owns. The renderer is loaded client-only
// (the Vega runtime touches the DOM).

import dynamic from 'next/dynamic';
import { useState, useRef, useEffect, type ComponentType } from 'react';
import type { VegaSpec } from '../types/genui';
import { vegaDarkTheme } from '../lib/vega-theme';
import { checkVegaSpec } from '../lib/vega-guard';

const VegaEmbed = dynamic(() => import('react-vega').then((m) => m.VegaEmbed), {
  ssr: false,
  loading: () => <div className="min-h-[200px] w-full animate-pulse rounded-lg bg-surface-raised/40" />,
}) as unknown as ComponentType<{
  spec: VegaSpec;
  options?: Record<string, unknown>;
  onError?: (error: unknown) => void;
}>;

// Multi-view specs (facet / repeat / concat) size their own sub-views.
const MULTI_VIEW_KEYS = ['facet', 'repeat', 'concat', 'hconcat', 'vconcat', 'spec'];

function Fallback({ message }: { message: string }) {
  return (
    <div className="flex min-h-[200px] w-full items-center justify-center rounded-lg border border-line bg-surface-sunken px-4 text-center text-[11px] text-zinc-500">
      {message}
    </div>
  );
}

export default function VegaChart({ spec }: { spec: VegaSpec }) {
  const [error, setError] = useState<string | null>(null);
  const [width, setWidth] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);

  // Measure the container and hand Vega-Lite an explicit numeric width. This
  // renders deterministically — unlike `width: 'container'`, which draws nothing
  // until the embed happens to observe a non-zero size.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      if (el.clientWidth > 0) setWidth(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const guard = checkVegaSpec(spec);
  if (!guard.ok) return <Fallback message={`Chart blocked — ${guard.reason}.`} />;

  const isMultiView = MULTI_VIEW_KEYS.some((k) => k in spec);
  const themed: VegaSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v6.json',
    background: 'transparent',
    config: vegaDarkTheme,
    ...spec,
    // `fit` scales the whole chart — axes included — into the measured width.
    ...(isMultiView ? {} : { width, autosize: { type: 'fit', contains: 'padding' } }),
  };

  return (
    <div ref={containerRef} className="vega-chart w-full">
      {error ? (
        <Fallback message={`Could not render chart: ${error}`} />
      ) : isMultiView || width > 0 ? (
        <VegaEmbed
          spec={themed}
          options={{ actions: false, renderer: 'svg', tooltip: { theme: 'dark' } }}
          onError={(e) => setError(String(e))}
        />
      ) : (
        <div className="min-h-[200px] w-full animate-pulse rounded-lg bg-surface-raised/40" />
      )}
    </div>
  );
}
