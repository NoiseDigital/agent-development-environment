'use client';

// The campaign spreadsheet — one row per (line × creative) pair. Editable
// fields commit on blur (or Enter), append to the per-line history, and
// trigger a re-fetch of the live performance columns.
//
// Editing model:
//   • Plan fields live on the LINE level (publisher, budget, …). Editing
//     any of them mutates the line, but every row that shares that line
//     reflects the change instantly.
//   • Creative fields live on the CREATIVE level. Editing them mutates a
//     single row.
//   • Performance columns are read-only.
//
// Persistence:
//   • Overrides + history live in localStorage today (see lib/dashboards/user-plans.ts).
//   • The seam is shaped so swapping to /api/plans is one file change.

import { useCallback, useMemo, useState } from 'react';
import {
  CREATIVE_FORMATS,
  MARKETING_OBJECTIVES,
  PLATFORMS,
  PUBLISHERS,
  type PlanCampaign,
  type PlanLine,
} from '../../data/plans';
import {
  loadLineHistory,
  saveLineEdit,
  type EditableLineField,
} from '../../lib/dashboards/user-plans';
import { linePerformance } from '../../lib/plan/performance';
import { usdCompact, pct } from '../../lib/format/format';
import { getCurrentUser } from '../../lib/auth';
import LineHistoryDrawer from './LineHistoryDrawer';

interface SpreadsheetProps {
  campaign: PlanCampaign;
  /** Re-fetch the plan from storage after an edit lands so every cell
   *  reads the saved value (and any other rows that share the same line
   *  pick up the change too). */
  onChanged: () => void;
}

/** A flattened row — one per (line, creative). Pivots a line's creatives
 *  into separate visual rows while keeping plan fields rendered once. */
interface SheetRow {
  line: PlanLine;
  creativeId: string;
  creativeName: string;
  /** True for the FIRST creative on a line — only on that row do we
   *  render the editable plan cells (rest get a soft "↳" continuation
   *  indicator so the eye groups them under the same line). */
  isLineHead: boolean;
}

function flattenRows(campaign: PlanCampaign): SheetRow[] {
  return campaign.lines.flatMap((line) =>
    line.creatives.map((cr, i) => ({
      line,
      creativeId: cr.id,
      creativeName: cr.name,
      isLineHead: i === 0,
    })),
  );
}

export default function PlanSpreadsheet({ campaign, onChanged }: SpreadsheetProps) {
  const rows = useMemo(() => flattenRows(campaign), [campaign]);
  const [historyLineId, setHistoryLineId] = useState<string | null>(null);

  /** Commit a single-field edit. Reads the prior value off the live line so
   *  the history entry's `before` matches what the user actually saw. */
  const commit = useCallback(
    (line: PlanLine, field: EditableLineField, raw: string) => {
      const before = String(line[field] ?? '');
      const next = field === 'budget' ? Number(raw) : raw;
      if (String(next) === before) return; // no-op
      const user = getCurrentUser();
      saveLineEdit(
        line.id,
        { [field]: next } as Partial<PlanLine>,
        {
          by: user.uid,
          field,
          before: before || null,
          after: String(raw) || null,
        },
      );
      onChanged();
    },
    [onChanged],
  );

  return (
    <>
      <div className="overflow-x-auto">
        <table className="min-w-full text-[12px]">
          <thead className="sticky top-0 z-10 bg-surface-sunken/95 backdrop-blur-sm">
            <tr className="border-b border-line text-left">
              <Th className="w-[180px]">Line / Creative</Th>
              <Th className="w-[140px]">Publisher</Th>
              <Th className="w-[140px]">Platform</Th>
              <Th className="w-[180px]">Objective</Th>
              <Th className="w-[150px]">Marketing Goal</Th>
              <Th className="w-[120px]">Format</Th>
              <Th className="w-[100px]" align="right">Budget</Th>
              <Th className="w-[110px]">Flight Start</Th>
              <Th className="w-[110px]">Flight End</Th>
              <PerfTh>Spend</PerfTh>
              <PerfTh>Impr.</PerfTh>
              <PerfTh>Clicks</PerfTh>
              <PerfTh>CTR</PerfTh>
              <PerfTh>CPC</PerfTh>
              <PerfTh>Pacing</PerfTh>
              <Th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => {
              const perf = linePerformance(row.line);
              const sameLineAsPrev = i > 0 && rows[i - 1].line.id === row.line.id;
              return (
                <tr
                  key={`${row.line.id}-${row.creativeId}`}
                  className={`border-b border-line/60 transition-colors hover:bg-surface/30 ${
                    sameLineAsPrev ? '' : 'border-t border-t-line/80'
                  }`}
                >
                  {/* Line / creative identity */}
                  <Td>
                    {row.isLineHead && (
                      <div className="text-[11px] font-mono text-faint">{row.line.id}</div>
                    )}
                    <div className="flex items-center gap-1.5">
                      {!row.isLineHead && <span className="text-disabled">↳</span>}
                      <span className="truncate text-muted">{row.creativeName}</span>
                    </div>
                  </Td>

                  {/* Line-level editable plan fields — only show on the head row. */}
                  {row.isLineHead ? (
                    <>
                      <Td>
                        <SelectCell
                          value={row.line.publisher}
                          options={PUBLISHERS}
                          onCommit={(v) => commit(row.line, 'publisher', v)}
                        />
                      </Td>
                      <Td>
                        <SelectCell
                          value={row.line.platform}
                          options={PLATFORMS}
                          onCommit={(v) => commit(row.line, 'platform', v)}
                        />
                      </Td>
                      <Td>
                        <TextCell
                          value={row.line.objective}
                          onCommit={(v) => commit(row.line, 'objective', v)}
                        />
                      </Td>
                      <Td>
                        <SelectCell
                          value={row.line.marketingObjective}
                          options={MARKETING_OBJECTIVES}
                          onCommit={(v) => commit(row.line, 'marketingObjective', v)}
                        />
                      </Td>
                      <Td>
                        <SelectCell
                          value={row.line.creativeFormat}
                          options={CREATIVE_FORMATS}
                          onCommit={(v) => commit(row.line, 'creativeFormat', v)}
                        />
                      </Td>
                      <Td align="right">
                        <NumberCell
                          value={row.line.budget}
                          onCommit={(v) => commit(row.line, 'budget', v)}
                        />
                      </Td>
                      <Td>
                        <DateCell
                          value={row.line.flightStart}
                          onCommit={(v) => commit(row.line, 'flightStart', v)}
                        />
                      </Td>
                      <Td>
                        <DateCell
                          value={row.line.flightEnd}
                          onCommit={(v) => commit(row.line, 'flightEnd', v)}
                        />
                      </Td>
                    </>
                  ) : (
                    <td colSpan={8} className="bg-surface-sunken/40 px-2 py-1.5 text-[11px] text-disabled">
                      Same line — edit above.
                    </td>
                  )}

                  {/* Live performance — read-only. */}
                  <PerfTd>{usdCompact(perf.spend)}</PerfTd>
                  <PerfTd>{compactNum(perf.impressions)}</PerfTd>
                  <PerfTd>{compactNum(perf.clicks)}</PerfTd>
                  <PerfTd>{pct(perf.ctr)}</PerfTd>
                  <PerfTd>{perf.cpc !== null ? `$${perf.cpc.toFixed(2)}` : '—'}</PerfTd>
                  <PerfTd>
                    <PacingBadge spent={perf.spentPct} elapsed={perf.flightElapsedPct} />
                  </PerfTd>

                  {/* History trigger — opens the drawer for this line. */}
                  <Td>
                    {row.isLineHead && (
                      <button
                        type="button"
                        onClick={() => setHistoryLineId(row.line.id)}
                        title="View edit history"
                        className="flex h-7 w-7 items-center justify-center rounded-md text-faint transition-colors hover:bg-surface-raised hover:text-muted"
                      >
                        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M12 8v4l3 2m6-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {historyLineId && (
        <LineHistoryDrawer
          lineId={historyLineId}
          entries={loadLineHistory(historyLineId)}
          onClose={() => setHistoryLineId(null)}
        />
      )}
    </>
  );
}

// ── Header / cell primitives ────────────────────────────────────────────────

function Th({
  children,
  className = '',
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  return (
    <th
      className={`px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-faint ${className}`}
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function PerfTh({ children }: { children: React.ReactNode }) {
  return (
    <th className="border-l border-line/60 bg-surface/30 px-2 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-positive/70">
      {children}
    </th>
  );
}

function Td({
  children,
  className = '',
  align = 'left',
}: {
  children?: React.ReactNode;
  className?: string;
  align?: 'left' | 'right';
}) {
  return (
    <td className={`px-2 py-1.5 align-top ${className}`} style={{ textAlign: align }}>
      {children}
    </td>
  );
}

function PerfTd({ children }: { children: React.ReactNode }) {
  return (
    <td className="border-l border-line/60 bg-surface/20 px-2 py-1.5 text-right text-muted tabular-nums">
      {children}
    </td>
  );
}

// ── Editable cells ──────────────────────────────────────────────────────────

const inputCls =
  'w-full rounded-md bg-transparent px-1.5 py-1 text-[12px] text-muted outline-none transition-colors hover:bg-surface focus:bg-surface focus:ring-1 focus:ring-line-strong';

/** A select cell. Commits on change. Tolerant of a current value that
 *  isn't in the option list (renders + keeps it). */
function SelectCell({
  value,
  options,
  onCommit,
}: {
  value: string;
  options: readonly string[];
  onCommit: (next: string) => void;
}) {
  const list = options.includes(value) ? options : [value, ...options];
  return (
    <select
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      className={`${inputCls} appearance-none pr-2`}
    >
      {list.map((o) => (
        <option key={o} value={o} className="bg-surface">
          {o}
        </option>
      ))}
    </select>
  );
}

/** Plain text cell. Commits on blur or Enter. Doesn't fire on every
 *  keystroke — that would write to history N times per word. */
function TextCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== value && onCommit(draft)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={inputCls}
    />
  );
}

function NumberCell({
  value,
  onCommit,
}: {
  value: number;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  return (
    <input
      type="number"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft);
        if (Number.isFinite(n) && n !== value) onCommit(String(n));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(String(value));
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={`${inputCls} text-right tabular-nums`}
    />
  );
}

function DateCell({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (next: string) => void;
}) {
  return (
    <input
      type="date"
      value={value}
      onChange={(e) => onCommit(e.target.value)}
      className={inputCls}
    />
  );
}

// ── Pacing badge — green when within ±5pp of flight elapsed, else amber/red.

function PacingBadge({ spent, elapsed }: { spent: number; elapsed: number }) {
  if (elapsed <= 0) return <span className="text-disabled">—</span>;
  const delta = spent - elapsed;
  let tone = 'bg-positive/15 text-positive border-positive/30';
  if (Math.abs(delta) > 0.15) tone = 'bg-danger/15 text-danger border-danger/30';
  else if (Math.abs(delta) > 0.05) tone = 'bg-warning/15 text-warning border-warning/30';
  const sign = delta >= 0 ? '+' : '';
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${tone}`}>
      {sign}{(delta * 100).toFixed(0)}pp
    </span>
  );
}

// Compact whole-number formatter — share the dashboards' `compact` helper
// but live here to keep this file's import surface small.
function compactNum(n: number): string {
  if (!Number.isFinite(n)) return '—';
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return String(n);
}
