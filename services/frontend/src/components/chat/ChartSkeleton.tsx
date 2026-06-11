'use client';

// Chart-shaped placeholder shown while the agent is generating a viz block.
// Renders at roughly the real chart's height + axis layout so the page
// doesn't jump when the spec arrives. Pure CSS / inline SVG — no Vega
// bootstrap cost.
//
// Used by ChatMessage when `message.uiKind === 'chart'` and the agent has
// started streaming text but not yet emitted the chart block.

interface SkeletonProps {
  /** Pick a silhouette that hints at what's coming. We don't know the exact
   *  shape yet — line/bar/area all map to a few visual archetypes. */
  shape?: 'line' | 'bar';
  /** Floating vs panel variant — match the surrounding chat density. */
  variant?: 'floating' | 'panel';
}

// Plot dimensions chosen to mirror a real Vega-Lite tile: panel ≈ 280px tall
// (matches dashboard trend tiles), floating ≈ 220px. The earlier 160-px box
// felt compressed because it was significantly shorter than the actual chart
// that landed in its place.
const HEIGHT = { panel: 'h-72', floating: 'h-56' } as const;

export default function ChartSkeleton({ shape = 'line', variant = 'panel' }: SkeletonProps) {
  const h = HEIGHT[variant];
  // y-axis tick stub copy that reads like real numeric tick labels (no real
  // data, but matches the cadence the eye expects on a money/count axis).
  const yTicks = ['$1.2M', '900K', '600K', '300K', '0'];
  // x-axis tick stubs — five evenly-spaced placeholders. Width-varied so they
  // read as labels, not blocks.
  const xTickWidths = ['w-9', 'w-8', 'w-9', 'w-8', 'w-9'];
  return (
    <div
      role="status"
      aria-label="Generating chart"
      className={`relative w-full overflow-hidden rounded-xl border border-line/60 bg-surface-sunken/60 ${h}`}
    >
      {/* Slow shimmer wash — gentler than the previous 1.6s pass so the
          placeholder reads as "loading" without strobing the eye. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.04) 50%, transparent 70%)',
          backgroundSize: '200% 100%',
          animation: 'chartSkeletonShimmer 2.4s ease-in-out infinite',
        }}
      />
      <style>{`@keyframes chartSkeletonShimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>

      {/* Plot area inset: leave room on the left for the y-axis labels (12)
          and at the bottom for the x-axis labels (8). Layered absolutely so
          the inner SVG can stretch to fill. */}
      <div className="absolute inset-y-4 left-12 right-4 bottom-8 top-4">
        {/* Y-axis gridlines — five evenly spaced, thinner than before. */}
        <div className="absolute inset-0 flex flex-col justify-between">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-px w-full bg-line/60" />
          ))}
        </div>
        {/* Silhouette layer — covers the gridline area exactly. */}
        <div className="absolute inset-0">
          {shape === 'bar' ? <BarSilhouette /> : <LineSilhouette />}
        </div>
      </div>

      {/* Y-axis labels — right-aligned at the left edge of the plot. */}
      <div className="pointer-events-none absolute inset-y-4 bottom-8 top-4 left-2 flex w-9 flex-col items-end justify-between">
        {yTicks.map((label) => (
          <span key={label} className="text-[9px] leading-none text-disabled">
            {label}
          </span>
        ))}
      </div>

      {/* X-axis labels — varied widths so they read as label stubs. */}
      <div className="pointer-events-none absolute bottom-2 left-12 right-4 flex items-center justify-between">
        {xTickWidths.map((w, i) => (
          <div key={i} className={`h-1.5 ${w} rounded bg-line/70`} />
        ))}
      </div>
    </div>
  );
}

function LineSilhouette() {
  // A smooth trend curve rendered as an SVG path. Stretches to fill the
  // parent — preserveAspectRatio="none" so it always reads as a chart line
  // regardless of card width.
  return (
    <svg viewBox="0 0 200 100" preserveAspectRatio="none" className="h-full w-full">
      <defs>
        <linearGradient id="chartSkelArea" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(212, 212, 216, 0.18)" />
          <stop offset="100%" stopColor="rgba(212, 212, 216, 0)" />
        </linearGradient>
      </defs>
      {/* Soft area fill under the line — adds depth so the silhouette doesn't
          read as a single thin stroke. */}
      <path
        d="M0,72 L20,64 L40,68 L60,46 L80,52 L100,32 L120,38 L140,22 L160,30 L180,16 L200,10 L200,100 L0,100 Z"
        fill="url(#chartSkelArea)"
      />
      <path
        d="M0,72 L20,64 L40,68 L60,46 L80,52 L100,32 L120,38 L140,22 L160,30 L180,16 L200,10"
        fill="none"
        stroke="rgba(212, 212, 216, 0.45)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Data points matching `point: true` on enriched chat charts. */}
      {[
        [20, 64], [60, 46], [100, 32], [140, 22], [180, 16],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="2" fill="rgba(212, 212, 216, 0.55)" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function BarSilhouette() {
  // Eight bars of varying heights to suggest a categorical breakdown.
  // Subtle alternating opacity gives the row a Pareto-like cascade.
  const heights = [88, 72, 60, 54, 44, 36, 28, 18];
  return (
    <div className="flex h-full w-full items-end justify-between gap-1.5">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-surface-raised/40"
          style={{ height: `${h}%`, opacity: 0.55 + (heights.length - i) * 0.04 }}
        />
      ))}
    </div>
  );
}
