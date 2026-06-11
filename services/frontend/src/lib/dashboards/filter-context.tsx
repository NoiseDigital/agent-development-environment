'use client';

// Dashboard filters — two-stage commit.
//
// The bar edits a DRAFT; tiles read APPLIED. Clicking "Apply" copies draft
// → applied, which is what triggers every tile to re-fetch. Two reasons:
//
//   1. Changing four dropdowns in a row used to fire four re-fetches (six+
//      tiles × four changes = ~24 BQ calls). Batching to one apply means a
//      single round-trip per user action.
//   2. The user gets clear feedback: the Apply button appears only when the
//      draft differs from applied, so "I have pending changes" is visible at
//      a glance.
//
// Reset clears both draft and applied. Patching the draft DOES NOT touch
// applied — tiles stay stable until Apply.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export interface DashboardFilters {
  campaign_phase?: string;
  publisher?: string;
  market_group?: string;
  creative_format?: string;
  kpi_goal?: string;
  /** Pipe-delimited campaign names — multi-select. When ≥ 2 are selected the
   *  TrendTile overlays each one's flight window as a comparison marker. */
  campaign?: string;
  /** Inclusive YYYY-MM-DD. Both undefined = "all available history". */
  date_from?: string;
  date_to?: string;
}

interface FiltersValue {
  /** What tiles read. Tiles include this in their useEffect deps. */
  filters: DashboardFilters;
  /** What the filter bar edits — the user's pending selections. */
  draft: DashboardFilters;
  /** Update one DRAFT field. Doesn't touch `filters` until Apply. */
  patch: (key: keyof DashboardFilters, value: string | undefined) => void;
  /** Commit the draft — copies draft into `filters`, triggering re-fetches. */
  apply: () => void;
  /** Clear both draft and applied. */
  reset: () => void;
  /** True when draft ≠ applied — the Apply button is visible. */
  dirty: boolean;
}

const Ctx = createContext<FiltersValue | null>(null);

function shallowEq(a: DashboardFilters, b: DashboardFilters): boolean {
  const keys: (keyof DashboardFilters)[] = [
    'campaign_phase', 'publisher', 'market_group', 'creative_format',
    'kpi_goal', 'campaign', 'date_from', 'date_to',
  ];
  return keys.every((k) => (a[k] ?? '') === (b[k] ?? ''));
}

export function DashboardFilterProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<DashboardFilters>({});
  const [draft, setDraft] = useState<DashboardFilters>({});

  const patch = useCallback(
    (key: keyof DashboardFilters, value: string | undefined) => {
      setDraft((prev) => {
        const next = { ...prev };
        if (value === undefined || value === '') delete next[key];
        else (next[key] as string) = value;
        return next;
      });
    },
    [],
  );

  const apply = useCallback(() => setFilters(draft), [draft]);
  const reset = useCallback(() => {
    setDraft({});
    setFilters({});
  }, []);

  const dirty = useMemo(() => !shallowEq(draft, filters), [draft, filters]);

  const value = useMemo<FiltersValue>(
    () => ({ filters, draft, patch, apply, reset, dirty }),
    [filters, draft, patch, apply, reset, dirty],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Tiles consume this; falls back to an empty filter set so a tile rendered
 *  outside a dashboard (e.g. in a standalone chat) still works unchanged. */
export function useDashboardFilters(): FiltersValue {
  return (
    useContext(Ctx) ?? {
      filters: {},
      draft: {},
      patch: () => {},
      apply: () => {},
      reset: () => {},
      dirty: false,
    }
  );
}
