// A budget diff visual — old value, new value, signed delta, and an optional
// proportional magnitude bar. Shared by the recommendation block (the propose
// side of the closed loop) and the Plan page change-history drilldown (the
// record side), so a change reads the same wherever it appears.

import { usd, usdDelta, pctDelta } from '../lib/format';

interface LineDiffProps {
  from: number;
  to: number;
  /** Render the proportional magnitude bar beneath the values. */
  bar?: boolean;
  /** Scale for the bar — pass the max across sibling rows so bars compare. */
  barMax?: number;
}

export default function LineDiff({ from, to, bar, barMax }: LineDiffProps) {
  const up = to > from;
  const down = to < from;
  const tone = up
    ? { text: 'text-emerald-400', chip: 'border-emerald-500/30 bg-emerald-500/10', fill: 'bg-emerald-500' }
    : down
      ? { text: 'text-red-400', chip: 'border-red-500/30 bg-red-500/10', fill: 'bg-red-500' }
      : { text: 'text-zinc-500', chip: 'border-line bg-surface-raised', fill: 'bg-zinc-600' };

  const max = Math.max(barMax ?? Math.max(from, to), 1);
  const lo = Math.min(from, to);
  const hi = Math.max(from, to);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-xs">
        <span className="tabular-nums text-zinc-500">{usd(from)}</span>
        <svg className="h-3 w-3 shrink-0 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7l5 5-5 5M6 12h12" />
        </svg>
        <span className="tabular-nums font-semibold text-white">{usd(to)}</span>
        {from !== to && (
          <span
            className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${tone.chip} ${tone.text}`}
          >
            {usdDelta(from, to)}
            {pctDelta(from, to) && ` · ${pctDelta(from, to)}`}
          </span>
        )}
      </div>
      {bar && (
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken">
          {/* Solid base = the lower of the two values; the colored extension is
              what the change adds (green) or removes (red). */}
          <div className="h-full bg-zinc-600" style={{ width: `${(lo / max) * 100}%` }} />
          <div className={`h-full ${tone.fill}`} style={{ width: `${((hi - lo) / max) * 100}%` }} />
        </div>
      )}
    </div>
  );
}
