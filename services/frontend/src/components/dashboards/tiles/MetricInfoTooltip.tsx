'use client';

// Single-metric (i) badge — used by KpiTile + Pivot column headers.

import { getMetricDefinition, type MetricDefinition } from '../../../lib/metric-semantics';
import InfoTooltip from './InfoTooltip';
import MetricDefinitionBlock from './MetricDefinitionBlock';

interface MetricInfoTooltipProps {
  metricKey: string;
  overrides?: Record<string, Partial<MetricDefinition>>;
  labelOverride?: string;
}

export default function MetricInfoTooltip({
  metricKey,
  overrides,
  labelOverride,
}: MetricInfoTooltipProps) {
  const def = getMetricDefinition(metricKey, overrides);
  if (!def) return null;
  return (
    <InfoTooltip ariaLabel={`What is ${labelOverride ?? def.label}?`} widthClass="w-72">
      <MetricDefinitionBlock def={def} labelOverride={labelOverride} />
    </InfoTooltip>
  );
}
