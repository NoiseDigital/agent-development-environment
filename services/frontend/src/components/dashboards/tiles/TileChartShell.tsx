'use client';

// Shared wrapper: HTML title + optional (i) tooltip slot. Pass `info` for
// rich chart-level tooltips, or `tooltipKey` for single-metric ones.

import type { ReactNode } from 'react';
import MetricInfoTooltip from './MetricInfoTooltip';
import ChartInfoTooltip, { type ChartInfo } from './ChartInfoTooltip';

interface TileChartShellProps {
  title: string;
  subtitle?: string;
  info?: ChartInfo;
  tooltipKey?: string;
  tooltipLabel?: string;
  children: ReactNode;
}

export default function TileChartShell({
  title,
  subtitle,
  info,
  tooltipKey,
  tooltipLabel,
  children,
}: TileChartShellProps) {
  return (
    <div className="flex h-full flex-col">
      <div className="mb-1 flex shrink-0 items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-sm font-medium text-foreground">{title}</p>
            {info ? (
              <ChartInfoTooltip {...info} title={title} />
            ) : tooltipKey ? (
              <MetricInfoTooltip metricKey={tooltipKey} labelOverride={tooltipLabel} />
            ) : null}
          </div>
          {subtitle && (
            <p className="mt-0.5 truncate text-[11px] text-faint">{subtitle}</p>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
