'use client';

// The closed loop's propose side — an agent-surfaced optimization the user can
// apply (and undo) as one batch. Applying writes to the line-change log, which
// the Plan page reads, so a recommendation acted on here shows up there as
// dated, attributable history. Styled to echo the Plan page's line table.

import { useState } from 'react';
import type { RecommendationProps } from '../../types/genui';
import { adLines, platformById } from '../../data/media-model';
import { applyBudgetChanges, undoBatch } from '../../lib/line-changes';
import { showToast } from '../../lib/toast';
import { usdDelta } from '../../lib/format';
import LineDiff from '../LineDiff';

export default function Recommendation({ title, rationale, changes }: RecommendationProps) {
  const rows = Array.isArray(changes) ? changes : [];
  const [batchId, setBatchId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-line-strong bg-surface p-4 text-xs text-zinc-500">
        This recommendation has no changes to apply.
      </div>
    );
  }

  const net = rows.reduce((s, c) => s + (c.to - c.from), 0);
  const barMax = Math.max(...rows.flatMap((c) => [c.from, c.to]), 1);
  const applied = batchId !== null;

  const apply = () => {
    const id = applyBudgetChanges(
      rows.map((c) => ({ adLineId: c.adLineId, to: c.to, reason: c.reason })),
      { source: 'agent', label: title },
    );
    setBatchId(id);
    showToast({
      message: `Applied — ${rows.length} ad line${rows.length !== 1 ? 's' : ''} updated. Tracked on the Plan page.`,
      tone: 'success',
      action: {
        label: 'Undo',
        onClick: () => {
          undoBatch(id);
          setBatchId(null);
          showToast({ message: 'Recommendation reverted.', tone: 'default' });
        },
      },
    });
  };

  const undo = () => {
    if (!batchId) return;
    undoBatch(batchId);
    setBatchId(null);
    showToast({ message: 'Recommendation reverted.', tone: 'default' });
  };

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-line-strong bg-surface">
      {/* Header */}
      <div className="border-b border-line px-4 py-3">
        <div className="flex items-center gap-1.5">
          <svg className="h-3.5 w-3.5 text-accent-400" fill="currentColor" viewBox="0 0 24 24">
            <path d="M11 3 8.5 8.5 3 11l5.5 2.5L11 19l2.5-5.5L19 11l-5.5-2.5L11 3Z" />
          </svg>
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent-400">
            Recommendation
          </span>
        </div>
        <h3 className="mt-1.5 text-sm font-semibold leading-snug text-white">{title}</h3>
        {rationale && <p className="mt-1 text-xs leading-relaxed text-zinc-400">{rationale}</p>}
      </div>

      {/* Change rows — one ad line each */}
      <div className="divide-y divide-line">
        {rows.map((c, i) => {
          const line = adLines.find((l) => l.id === c.adLineId);
          return (
            <div key={`${c.adLineId}-${i}`} className="flex items-start gap-4 px-4 py-3">
              <div className="min-w-0 flex-1">
                {line ? (
                  <>
                    <p className="truncate text-xs font-medium text-white">
                      {platformById(line.platformId).name} · {line.tactic}
                    </p>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                      {line.format} · {line.market}
                    </p>
                  </>
                ) : (
                  <p className="font-mono text-[11px] text-zinc-400">{c.adLineId}</p>
                )}
                {c.reason && (
                  <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">{c.reason}</p>
                )}
              </div>
              <div className="w-44 shrink-0">
                <LineDiff from={c.from} to={c.to} bar barMax={barMax} />
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer — net summary + apply / undo */}
      <div className="flex items-center justify-between gap-3 border-t border-line bg-surface-sunken/60 px-4 py-3">
        <p className="text-xs text-zinc-400">
          Net{' '}
          <span
            className={
              net > 0 ? 'font-semibold text-emerald-400' : net < 0 ? 'font-semibold text-red-400' : 'text-zinc-300'
            }
          >
            {usdDelta(0, net)}
          </span>{' '}
          across {rows.length} line{rows.length !== 1 ? 's' : ''}
        </p>
        {applied ? (
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400">
              <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
              Applied
            </span>
            <button
              type="button"
              onClick={undo}
              className="rounded-lg border border-line-strong px-3 py-1.5 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white"
            >
              Undo
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={apply}
            className="rounded-lg bg-white px-3 py-1.5 text-[11px] font-semibold text-black transition-colors hover:bg-zinc-200"
          >
            Apply changes
          </button>
        )}
      </div>
    </div>
  );
}
