'use client';

// Chart-level tooltip: summary + Metrics + Good-to-know sections.

import { getMetricDefinition, type MetricDefinition } from '../../../lib/metric-semantics';
import InfoTooltip from './InfoTooltip';

export interface ChartInfo {
  summary: string;
  metricKeys: string[];
  notes?: string[];
  overrides?: Record<string, Partial<MetricDefinition>>;
  title?: string;
}

const UNIT_BADGE: Record<NonNullable<MetricDefinition['unit']>, string> = {
  currency: '$',
  count: '#',
  percent: '%',
  ratio: '×',
};

function MetricRow({ def }: { def: MetricDefinition }) {
  return (
    <li className="flex items-baseline gap-1.5 text-[11px] leading-snug text-zinc-300">
      <span className="shrink-0 font-semibold text-white">{def.label}</span>
      {def.unit && (
        <span className="shrink-0 rounded border border-zinc-700 bg-zinc-900 px-1 text-[8px] font-medium uppercase text-zinc-400">
          {UNIT_BADGE[def.unit]}
        </span>
      )}
      <span className="text-zinc-600">·</span>
      <span className="text-zinc-300">{def.summary}</span>
    </li>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </p>
  );
}

export default function ChartInfoTooltip({
  summary,
  metricKeys,
  notes,
  overrides,
  title,
}: ChartInfo) {
  const seen = new Set<string>();
  const defs = metricKeys
    .filter((k) => (seen.has(k) ? false : (seen.add(k), true)))
    .map((k) => getMetricDefinition(k, overrides))
    .filter((d): d is MetricDefinition => !!d);

  return (
    <InfoTooltip
      ariaLabel={title ? `About ${title}` : 'About this chart'}
      widthClass="w-80"
    >
      <p className="text-[11px] leading-relaxed text-zinc-200">{summary}</p>

      {defs.length > 0 && (
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <SectionHeader>Metrics</SectionHeader>
          <ul className="space-y-1">
            {defs.map((def) => (
              <MetricRow key={def.label} def={def} />
            ))}
          </ul>
        </div>
      )}

      {notes && notes.length > 0 && (
        <div className="mt-3 border-t border-zinc-800 pt-2">
          <SectionHeader>Good to know</SectionHeader>
          <ul className="space-y-1">
            {notes.map((n, i) => (
              <li key={i} className="flex gap-1.5 text-[10.5px] leading-snug text-zinc-400">
                <span className="text-zinc-600">•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InfoTooltip>
  );
}
