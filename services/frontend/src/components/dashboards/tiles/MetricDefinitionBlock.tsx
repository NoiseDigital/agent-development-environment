'use client';

// One metric's canonical definition as a small card.

import type { MetricDefinition } from '../../../lib/metrics/semantics';

const UNIT_BADGE: Record<NonNullable<MetricDefinition['unit']>, string> = {
  currency: '$',
  count: '#',
  percent: '%',
  ratio: '×',
};

interface MetricDefinitionBlockProps {
  def: MetricDefinition;
  labelOverride?: string;
}

export default function MetricDefinitionBlock({ def, labelOverride }: MetricDefinitionBlockProps) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-white">{labelOverride ?? def.label}</p>
        {def.unit && (
          <span className="rounded-md border border-zinc-700 bg-zinc-900 px-1.5 text-[9px] font-medium text-zinc-400">
            {UNIT_BADGE[def.unit]}
          </span>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-zinc-300">{def.summary}</p>
      {def.formula && (
        <p className="mt-1.5 text-[10px] text-zinc-500">
          <span className="text-zinc-600">Formula: </span>
          <span className="font-mono text-zinc-300">{def.formula}</span>
        </p>
      )}
      {def.betterLower !== undefined && (
        <p className="mt-1 text-[10px] text-zinc-500">
          <span className="text-zinc-600">Direction: </span>
          <span className="text-zinc-300">
            {def.betterLower ? 'lower is better' : 'higher is better'}
          </span>
        </p>
      )}
      {def.notes && (
        <p className="mt-1.5 border-t border-zinc-800 pt-1.5 text-[10px] italic text-zinc-500">
          {def.notes}
        </p>
      )}
    </div>
  );
}
