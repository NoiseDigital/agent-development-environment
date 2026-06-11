// Plan ↔ performance join — the live perf columns shown next to each
// editable plan line. Today this is a stub that returns deterministic
// fake numbers so the spreadsheet renders something useful; tomorrow it
// becomes a query against `media_campaign_performance_NOI` grouped by
// `line_id` and clipped to the line's flight window.
//
// The seam is shaped as `linePerformance(lineId, flightStart, flightEnd)`
// so the public signature won't change when we swap the implementation —
// the spreadsheet and the agent insights both consume `LinePerformance`.

import type { PlanLine } from '../../data/plans/types';

export interface LinePerformance {
  /** Cumulative spend across the line's flight window. */
  spend: number;
  impressions: number;
  clicks: number;
  /** Spend ÷ budget. 0..1+ — over-pace shows > 1. */
  spentPct: number;
  /** Share of the flight window elapsed. 0..1. */
  flightElapsedPct: number;
  /** Click-through rate, computed in the join — same definition as BQ. */
  ctr: number;
  /** Cost per click — null when clicks=0 so the UI can render "—". */
  cpc: number | null;
}

/** Today: a deterministic stub seeded off the line id so each line shows
 *  consistent numbers turn-to-turn. Tomorrow: replace the body with a
 *  toolbox query — the signature is the contract. */
export function linePerformance(line: PlanLine): LinePerformance {
  const seed = hashString(line.id);
  // ~40-95% spent based on the seed; +/- a sliver from budget so even-budget
  // lines look distinct in the strip.
  const spentPct = 0.4 + (seed % 56) / 100;
  const spend = line.budget * spentPct;
  // Naive impressions: pretend CPM ranges 4-22 depending on the line.
  const cpm = 4 + (seed % 18);
  const impressions = cpm > 0 ? Math.round((spend / cpm) * 1000) : 0;
  // CTR varies 0.2% - 4.8%.
  const ctr = ((seed % 47) + 2) / 1000;
  const clicks = Math.round(impressions * ctr);
  const cpc = clicks > 0 ? spend / clicks : null;

  const flightElapsedPct = elapsedFraction(line.flightStart, line.flightEnd);

  return { spend, impressions, clicks, spentPct, flightElapsedPct, ctr, cpc };
}

/** A 32-bit stable hash for a string. Cheap; deterministic; enough to seed
 *  the stub's fake numbers. */
function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

/** Share of the flight window elapsed today. Clipped to [0, 1]. */
function elapsedFraction(start: string, end: string): number {
  const t0 = Date.parse(`${start}T00:00:00Z`);
  const t1 = Date.parse(`${end}T23:59:59Z`);
  if (!Number.isFinite(t0) || !Number.isFinite(t1) || t1 <= t0) return 0;
  const now = Date.now();
  if (now <= t0) return 0;
  if (now >= t1) return 1;
  return (now - t0) / (t1 - t0);
}
