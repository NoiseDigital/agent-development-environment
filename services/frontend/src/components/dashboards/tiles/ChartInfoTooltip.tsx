'use client';

// Chart-level tooltip: summary + Metrics + Good-to-know sections.

import { getMetricDefinition, type MetricDefinition } from '../../../lib/metrics/semantics';
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
    <li className="flex items-baseline gap-1.5 text-[11px] leading-snug text-muted">
      <span className="shrink-0 font-semibold text-foreground">{def.label}</span>
      {def.unit && (
        <span className="shrink-0 rounded border border-line-strong bg-surface px-1 text-[8px] font-medium uppercase text-subtle">
          {UNIT_BADGE[def.unit]}
        </span>
      )}
      <span className="text-disabled">·</span>
      <span className="text-muted">{def.summary}</span>
    </li>
  );
}

function SectionHeader({ children }: { children: string }) {
  return (
    <p className="mb-1 text-[9px] font-semibold uppercase tracking-wider text-faint">
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
      <p className="text-[11px] leading-relaxed text-foreground">{summary}</p>

      {defs.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <SectionHeader>Metrics</SectionHeader>
          <ul className="space-y-1">
            {defs.map((def) => (
              <MetricRow key={def.label} def={def} />
            ))}
          </ul>
        </div>
      )}

      {notes && notes.length > 0 && (
        <div className="mt-3 border-t border-line pt-2">
          <SectionHeader>Good to know</SectionHeader>
          <ul className="space-y-1">
            {notes.map((n, i) => (
              <li key={i} className="flex gap-1.5 text-[10.5px] leading-snug text-subtle">
                <span className="text-disabled">•</span>
                <span>{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </InfoTooltip>
  );
}
