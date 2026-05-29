'use client';

// A `templated_chart` GenUI block. The agent emits the lightweight payload
// `{shape, rows, title, valueFormat}` and we apply a deterministic Vega-Lite
// template to it at render time. Skips the VegaChartsAgent subagent's LLM
// call entirely for the 80% of chart turns that fit a known shape.
//
// Reuses ChartBlock for the actual render so the "save to dashboard"
// affordance and `enrichAgentSpec` post-processing work identically to a
// regular `chart` block.

import { useMemo } from 'react';
import type { TemplatedChartProps } from '../../types/genui';
import {
  applyTemplate,
  coerceTemplatedChartProps,
} from '../../lib/vega-templates';
import ChartBlock from './ChartBlock';

export default function TemplatedChartBlock({ props }: { props: TemplatedChartProps }) {
  // Coerce + apply once. If the payload is malformed (unknown shape, no
  // rows, etc.) we fall back to a quiet placeholder rather than crashing —
  // a malformed turn shouldn't take down the whole chat bubble.
  const spec = useMemo(() => {
    const coerced = coerceTemplatedChartProps(props);
    if (!coerced) return null;
    try {
      return applyTemplate(coerced);
    } catch {
      return null;
    }
  }, [props]);

  if (!spec) {
    return (
      <p className="text-[11px] text-zinc-500">
        Chart payload was malformed — nothing to render.
      </p>
    );
  }

  return <ChartBlock spec={spec} />;
}
