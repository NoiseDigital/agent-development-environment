// Ad-line change log — the closed loop's write side. A recommendation (or a
// manual edit) doesn't mutate the planned media model; it appends a LineChange.
// The model stays the git-versioned baseline, and every change to it is a dated,
// attributable, undoable row — so a line's budget has a history, not just a
// value. This is user/working data: localStorage today, a table later.

import { useSyncExternalStore } from 'react';
import { adLines } from '../data/media-model';
import { newId } from './id';

export type LineChangeField = 'budget';
export type LineChangeSource = 'agent' | 'manual';

export interface LineChange {
  id: string;
  adLineId: string;
  field: LineChangeField;
  /** Value before the change — the line's effective value at apply time, so a
   *  chain of changes reads as a true before→after history. */
  from: number;
  to: number;
  at: string; // ISO timestamp
  source: LineChangeSource;
  /** Groups the changes applied together from one recommendation — the unit of
   *  undo, and the handle that ties a history row back to its recommendation. */
  batchId: string;
  /** Human label for the batch, e.g. the recommendation's title. */
  batchLabel?: string;
  /** Why this line specifically was changed. */
  reason?: string;
}

const KEY = 'noise:line-changes';

// ── Store ─────────────────────────────────────────────────────────────────────

const listeners = new Set<() => void>();
let version = 0;

function emit() {
  version += 1;
  listeners.forEach((fn) => fn());
}

export function loadLineChanges(): LineChange[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
  } catch {
    return [];
  }
}

function persist(changes: LineChange[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(changes));
  } catch {
    /* ignore quota errors */
  }
  emit();
}

// ── Queries ───────────────────────────────────────────────────────────────────

const baseBudget = (adLineId: string): number =>
  adLines.find((l) => l.id === adLineId)?.budget ?? 0;

/** Every change to one ad line, newest first. */
export function lineHistory(adLineId: string): LineChange[] {
  return loadLineChanges()
    .filter((c) => c.adLineId === adLineId)
    .sort((a, b) => b.at.localeCompare(a.at));
}

/** The line's current budget — the latest applied change, or the planned
 *  baseline if it has never been touched. */
export function effectiveBudget(adLineId: string): number {
  const latest = lineHistory(adLineId).find((c) => c.field === 'budget');
  return latest ? latest.to : baseBudget(adLineId);
}

/** Whether a line's budget has been changed from its planned baseline. */
export function isLineEdited(adLineId: string): boolean {
  return effectiveBudget(adLineId) !== baseBudget(adLineId);
}

// ── Mutations ─────────────────────────────────────────────────────────────────

export interface BudgetEdit {
  adLineId: string;
  to: number;
  reason?: string;
}

/** Apply a set of budget edits as one batch — the undoable unit. Each row's
 *  `from` is captured as the line's effective budget *now*, so re-applying or
 *  stacking recommendations always reads truthfully. Returns the batch id. */
export function applyBudgetChanges(
  edits: BudgetEdit[],
  meta: { source: LineChangeSource; label?: string },
): string {
  const batchId = newId('batch');
  const at = new Date().toISOString();
  const rows: LineChange[] = edits.map((e) => ({
    id: newId('chg'),
    adLineId: e.adLineId,
    field: 'budget',
    from: effectiveBudget(e.adLineId),
    to: e.to,
    at,
    source: meta.source,
    batchId,
    batchLabel: meta.label,
    reason: e.reason,
  }));
  persist([...rows, ...loadLineChanges()]);
  return batchId;
}

/** Roll back every change made by one batch. */
export function undoBatch(batchId: string): void {
  persist(loadLineChanges().filter((c) => c.batchId !== batchId));
}

// ── React binding ─────────────────────────────────────────────────────────────

/** Subscribe a component to the change log — it re-renders whenever a batch is
 *  applied or undone, in this tab. Returns a version counter (the value itself
 *  is unimportant; the identity change is what drives the re-render). */
export function useLineChanges(): number {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => version,
    () => 0,
  );
}
