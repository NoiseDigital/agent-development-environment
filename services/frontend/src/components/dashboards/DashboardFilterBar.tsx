'use client';

// The report filter row — one dropdown per dimension + a date range. The bar
// edits a DRAFT; "Apply" commits the draft to the active filter set, which is
// what triggers every tile to re-fetch. The Apply button only appears when
// there are pending changes, so the user gets clear feedback that something
// is staged but not yet live.

import { useEffect, useState } from 'react';
import {
  dashboardData,
  type FilterDim,
  type NamedValue,
} from '../../lib/dashboards';
import {
  useDashboardFilters,
  type DashboardFilters,
} from '../../lib/dashboards/filter-context';
import MultiSelectFilter from './MultiSelectFilter';

interface FilterSpec {
  /** Column on the BQ table. Doubles as the key in DashboardFilters. */
  dim: Extract<FilterDim, keyof DashboardFilters & string>;
  label: string;
}

// The fixed set of categorical filters every dashboard shows. New ones land
// here once both the tile they affect AND a tool parameter exist; otherwise
// the dropdown wouldn't actually do anything.
const FILTERS: FilterSpec[] = [
  { dim: 'publisher', label: 'Publisher' },
  { dim: 'campaign_phase', label: 'Campaign Phase' },
  { dim: 'campaign', label: 'Campaign' },
  { dim: 'market_group', label: 'Market' },
  { dim: 'creative_format', label: 'Format' },
  { dim: 'kpi_goal', label: 'KPI Goal' },
];

export default function DashboardFilterBar() {
  const { draft, filters, patch, apply, reset, dirty } = useDashboardFilters();
  const [options, setOptions] = useState<Record<string, NamedValue[]>>({});
  const [loading, setLoading] = useState(true);

  // Fetch all dropdown option lists in parallel on mount.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(
      FILTERS.map(async (f) => {
        try {
          const opts = await dashboardData.dimensionValues(f.dim, 50);
          return [f.dim, opts] as const;
        } catch {
          return [f.dim, [] as NamedValue[]] as const;
        }
      }),
    ).then((pairs) => {
      if (cancelled) return;
      setOptions(Object.fromEntries(pairs));
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const hasApplied = Object.values(filters).some((v) => v !== undefined && v !== '');
  const hasDraft = Object.values(draft).some((v) => v !== undefined && v !== '');

  return (
    <div className="flex flex-wrap items-end gap-3">
      {FILTERS.map((f) => (
        <MultiSelectFilter
          key={f.dim}
          label={f.label}
          value={draft[f.dim]}
          options={options[f.dim] ?? []}
          loading={loading}
          onChange={(v) => patch(f.dim, v)}
        />
      ))}

      {/* Date range — two date inputs. Both clear together via Reset. */}
      <div>
        <p className="mb-1 text-[10px] font-medium uppercase tracking-wider text-faint">
          Date Range
        </p>
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={draft.date_from ?? ''}
            onChange={(e) => patch('date_from', e.target.value || undefined)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-muted transition-colors hover:border-line-strong"
            aria-label="Start date"
          />
          <span className="text-xs text-disabled">→</span>
          <input
            type="date"
            value={draft.date_to ?? ''}
            onChange={(e) => patch('date_to', e.target.value || undefined)}
            className="rounded-md border border-line bg-surface px-2 py-1.5 text-xs text-muted transition-colors hover:border-line-strong"
            aria-label="End date"
          />
        </div>
      </div>

      {/* Apply (visible only when draft differs from applied) + Clear
          (visible whenever there's anything to reset, draft or applied). */}
      <div className="flex items-end gap-1.5">
        {dirty && (
          <button
            type="button"
            onClick={apply}
            className="self-end animate-in fade-in slide-in-from-bottom-1 rounded-md bg-inverse px-3 py-1.5 text-[11px] font-semibold text-inverse-foreground shadow-lg shadow-foreground/10 transition-colors hover:bg-inverse/90"
            aria-label="Apply pending filter changes"
          >
            Apply
          </button>
        )}
        {(hasApplied || hasDraft) && (
          <button
            type="button"
            onClick={reset}
            className="self-end rounded-md border border-line bg-surface px-2.5 py-1.5 text-[11px] font-medium text-subtle transition-colors hover:border-line-strong hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
