'use client';

// A tiny inline trend line — the kind that sits below a KPI value. Pure SVG so
// it stays cheap to mount many on one screen (a dashboard's KPI strip often
// renders six or more); a Vega-Lite chart per tile would each carry its own
// runtime + measurement loop, which is overkill at this size.

export interface SparklineProps {
  /** Recent-period values, oldest → newest. Two or more points required. */
  values: number[];
  /** Tone: positive (emerald) / negative (red) / neutral (zinc). Keeps the
   *  sparkline aligned with the KPI delta chip beside it. */
  tone?: 'positive' | 'negative' | 'neutral';
  width?: number;
  height?: number;
  /** Optional aria-label — defaults to "trend sparkline". */
  ariaLabel?: string;
}

const TONE_STROKE: Record<NonNullable<SparklineProps['tone']>, string> = {
  positive: '#34d399',
  negative: '#f87171',
  neutral: '#71717a',
};

export default function Sparkline({
  values,
  tone = 'neutral',
  width = 64,
  height = 16,
  ariaLabel = 'trend sparkline',
}: SparklineProps) {
  if (!values || values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  // A flat series still draws a centred line rather than collapsing to zero
  // height — visually identical to "no change" without a divide-by-zero quirk.
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = i * stepX;
    const y = height - ((v - min) / span) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const stroke = TONE_STROKE[tone];
  // The path doubles as a baseline-anchored area fill — a soft wash beneath
  // the line that gives the tiny trend a bit more presence at small sizes.
  const areaPath = `M0,${height} L${points.join(' L')} L${width},${height} Z`;
  const linePath = `M${points.join(' L')}`;
  return (
    <svg
      role="img"
      aria-label={ariaLabel}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
    >
      <path d={areaPath} fill={stroke} fillOpacity={0.12} stroke="none" />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={1.25} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}
