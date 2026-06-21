// Plan persistence — for the prototype this is localStorage; the seam is
// shaped so promoting it to a Postgres-backed `/api/plans` endpoint later
// is a one-file swap inside this module. Mirrors `user-dashboards.ts`.
//
// Two distinct things live here:
//   1. Per-client plan OVERRIDES — the user's edits to a code-defined plan
//      (budgets bumped, dates shifted, lines added). Stored as a flat map
//      keyed by line id so a single edit is a tiny write.
//   2. Per-line EDIT HISTORY — an append-only log used by the history
//      drawer. Capped to the most recent N entries per line so localStorage
//      can't blow out.
//
// Reading a plan blends the code-defined seed with overrides + appends.
// The result is the same `ClientPlan` shape every renderer already knows.

import type {
  ClientPlan,
  PlanCampaign,
  PlanEdit,
  PlanLine,
} from '../../data/plans/types';
import { clientPlans } from '@/data/plans';
import { TENANT } from '@/config/tenant';

// Tenant-scoped so one tenant's local plan edits never bleed into another's.
const OVERRIDES_KEY = `${TENANT}:plan-overrides`;
const HISTORY_KEY = `${TENANT}:plan-history`;

/** Most recent history entries kept per line. The drawer shows the latest
 *  N; deeper history will live server-side once persistence moves there. */
const HISTORY_CAP_PER_LINE = 50;

/** Editable fields on a line — narrow type so a TS error catches a typo. */
export type EditableLineField =
  | 'publisher'
  | 'platform'
  | 'objective'
  | 'marketingObjective'
  | 'creativeFormat'
  | 'budget'
  | 'flightStart'
  | 'flightEnd';

/** A patch applied to one line. `Partial<>` so a single field changing only
 *  serialises that field. */
type LineOverride = Partial<Pick<PlanLine, EditableLineField>>;

interface OverrideStore {
  /** Keyed by line id. */
  lines: Record<string, LineOverride>;
}

interface HistoryStore {
  /** Keyed by line id; each value is the most-recent-first edit log. */
  byLine: Record<string, PlanEdit[]>;
}

// ── Storage helpers ──────────────────────────────────────────────────────────

function readOverrides(): OverrideStore {
  if (typeof window === 'undefined') return { lines: {} };
  try {
    return (JSON.parse(window.localStorage.getItem(OVERRIDES_KEY) ?? 'null') as OverrideStore) ?? { lines: {} };
  } catch {
    return { lines: {} };
  }
}

function writeOverrides(store: OverrideStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OVERRIDES_KEY, JSON.stringify(store));
  } catch {
    /* quota — fall back to in-memory only */
  }
}

function readHistory(): HistoryStore {
  if (typeof window === 'undefined') return { byLine: {} };
  try {
    return (JSON.parse(window.localStorage.getItem(HISTORY_KEY) ?? 'null') as HistoryStore) ?? { byLine: {} };
  } catch {
    return { byLine: {} };
  }
}

function writeHistory(store: HistoryStore): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(HISTORY_KEY, JSON.stringify(store));
  } catch {
    /* quota — drop oldest entries on next write */
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Every code-defined client plan, with the user's saved overrides
 *  applied. Pure: passing the same overrides twice returns equal trees. */
export function loadPlans(): ClientPlan[] {
  const overrides = readOverrides();
  return clientPlans.map((p) => applyOverrides(p, overrides));
}

/** One client's plan by code. Returns null if the code is unknown. */
export function loadPlanByClient(code: string): ClientPlan | null {
  const plan = clientPlans.find((p) => p.clientCode === code);
  if (!plan) return null;
  return applyOverrides(plan, readOverrides());
}

/** Patch one line. Persists the override, appends an entry to the per-line
 *  history. Caller passes a single field change at a time so the history
 *  reads as one edit per row in the drawer. */
export function saveLineEdit(
  lineId: string,
  patch: LineOverride,
  edit: Omit<PlanEdit, 'at'>,
): void {
  // 1) merge override
  const store = readOverrides();
  const next = { ...(store.lines[lineId] ?? {}), ...patch };
  writeOverrides({ lines: { ...store.lines, [lineId]: next } });

  // 2) append history
  const hist = readHistory();
  const entry: PlanEdit = { ...edit, at: Date.now() };
  const prior = hist.byLine[lineId] ?? [];
  const capped = [entry, ...prior].slice(0, HISTORY_CAP_PER_LINE);
  writeHistory({ byLine: { ...hist.byLine, [lineId]: capped } });
}

/** Read the edit log for one line — newest first. */
export function loadLineHistory(lineId: string): PlanEdit[] {
  return readHistory().byLine[lineId] ?? [];
}

/** Discard every override + history entry. Useful for "reset to plan-as-code"
 *  and for tests. */
export function clearAllPlanEdits(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(OVERRIDES_KEY);
  window.localStorage.removeItem(HISTORY_KEY);
}

// ── Internal: applying overrides ─────────────────────────────────────────────

function applyOverrides(plan: ClientPlan, store: OverrideStore): ClientPlan {
  return {
    ...plan,
    campaigns: plan.campaigns.map((c) => applyToCampaign(c, store)),
  };
}

function applyToCampaign(c: PlanCampaign, store: OverrideStore): PlanCampaign {
  return {
    ...c,
    lines: c.lines.map((l) => {
      const override = store.lines[l.id];
      return override ? { ...l, ...override } : l;
    }),
  };
}
