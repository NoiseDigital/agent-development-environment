'use client';

// Chart-shaped placeholder shown while the agent is generating a viz block.
// Renders in the same slot the real chart will land in, so the page doesn't
// jump when the spec arrives. Pure CSS — no Vega bootstrap cost.
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

export default function ChartSkeleton({ shape = 'line', variant = 'panel' }: SkeletonProps) {
  const h = variant === 'floating' ? 'h-32' : 'h-40';
  return (
    <div
      role="status"
      aria-label="Generating chart"
      className={`relative w-full overflow-hidden rounded-xl border border-zinc-800/60 bg-zinc-950/60 ${h}`}
    >
      {/* Subtle shimmer wash so the placeholder doesn't read as a static block. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.05) 50%, transparent 70%)',
          backgroundSize: '200% 100%',
          animation: 'chartSkeletonShimmer 1.6s ease-in-out infinite',
        }}
      />
      <style>{`@keyframes chartSkeletonShimmer { 0% { background-position: 200% 0 } 100% { background-position: -200% 0 } }`}</style>

      {/* Y-axis gridlines */}
      <div className="absolute inset-y-3 left-7 right-3 flex flex-col justify-between">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-px w-full bg-zinc-800/50" />
        ))}
      </div>

      {/* Y-axis tick stubs */}
      <div className="absolute inset-y-3 left-1 flex flex-col justify-between">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-2 w-5 rounded bg-zinc-800/60" />
        ))}
      </div>

      {/* Silhouette layer */}
      <div className="absolute inset-x-7 inset-y-4 flex items-end">
        {shape === 'bar' ? <BarSilhouette /> : <LineSilhouette />}
      </div>
    </div>
  );
}

function LineSilhouette() {
  // A faint zig-zag line approximating a real trend. Pure SVG, scaled
  // to fill the silhouette layer.
  return (
    <svg viewBox="0 0 200 60" preserveAspectRatio="none" className="h-full w-full">
      <path
        d="M0,45 L25,38 L50,42 L75,22 L100,28 L125,12 L150,18 L175,30 L200,8"
        fill="none"
        stroke="rgba(212, 212, 216, 0.35)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* A handful of points along the silhouette to mirror `point: true`. */}
      {[
        [25, 38], [75, 22], [125, 12], [175, 30],
      ].map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r="1.6" fill="rgba(212, 212, 216, 0.45)" />
      ))}
    </svg>
  );
}

function BarSilhouette() {
  // Eight bars of varying heights to suggest a categorical breakdown.
  const heights = [70, 58, 90, 50, 78, 32, 64, 44];
  return (
    <div className="flex h-full w-full items-end justify-between gap-1.5">
      {heights.map((h, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm bg-zinc-700/50"
          style={{ height: `${h}%` }}
        />
      ))}
    </div>
  );
}
