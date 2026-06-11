'use client';

// Dashboard edit context — the bridge between the dashboard page (which knows
// it is being edited, by whom, and on which tab) and the FloatingAssistant
// chat (which lives at the layout level and needs that information to switch
// from "analyse this dashboard" mode into "generate a viz and save it here"
// mode).
//
// Kept deliberately tiny: one provider scoped to the dashboard detail view,
// one hook for consumers. The chat reads it; when it's null, the chat falls
// back to its default analyse-only behaviour.

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { DashboardTab } from '../../data/dashboards';

export interface DashboardEditContextValue {
  dashboardId: string;
  /** Human-readable dashboard name — needed for the agent context preamble
   *  so the agent can identify which dashboard it is grounded in. */
  dashboardName: string;
  tabId: string;
  /** Human-readable tab name — shown in the chat header so the user knows
   *  where any saved chart will land. */
  tabLabel: string;
  /** True when the dashboard is in edit mode AND the user has the role to
   *  save tiles. The chat shows the save-to-dashboard affordance only when
   *  this is true; outside edit mode the same chat surface is analysis-only.
   *  Also drives agent routing (editor vs analyst). */
  canGenerate: boolean;
  /** Every tab on the dashboard — fed into the agent context preamble so the
   *  analyst can point the user to a different tab when relevant. */
  tabs: DashboardTab[];
  /** The tab the user is currently looking at — supplies the tile manifest
   *  for the agent context preamble. */
  activeTab: DashboardTab;
  /** Notify the dashboard that a chart was pinned, so it re-derives tiles
   *  and the new pin appears immediately without a manual refresh. */
  onPinned: () => void;
}

const Ctx = createContext<DashboardEditContextValue | null>(null);

export function DashboardEditProvider({
  value,
  children,
}: {
  value: DashboardEditContextValue | null;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The active dashboard edit session, or null when not on a dashboard / not
 *  in edit mode. Consumers use the presence of a value as the gate for any
 *  generation-specific affordance. */
export function useDashboardEdit(): DashboardEditContextValue | null {
  return useContext(Ctx);
}

// ── Add-viz intent bus ──────────────────────────────────────────────────────
//
// One-shot signal the edit toolbar fires when the user clicks "Ask agent to
// add a viz". The FloatingAssistant subscribes; on a tick it opens itself and
// prefills the input with a starter prompt + suggestion chips. Decoupled from
// the edit context so the assistant doesn't have to live inside the dashboard
// subtree — it sits at the layout level.

export interface AddVizIntent {
  /** Prefilled assistant prompt (placeholder, not auto-sent). */
  prompt: string;
  /** One-click suggestion buttons shown above the input. */
  suggestions: string[];
  /** Monotonic counter — bumped on each fire so the same prompt can be
   *  re-triggered (the assistant subscribes via useEffect with this as a dep). */
  tick: number;
}

type AddVizListener = (intent: AddVizIntent) => void;

const listeners = new Set<AddVizListener>();
let tick = 0;

/** Fire the intent. Used by the dashboard's edit toolbar. */
export function fireAddVizIntent(prompt: string, suggestions: string[]): void {
  tick += 1;
  const intent: AddVizIntent = { prompt, suggestions, tick };
  for (const l of listeners) l(intent);
}

/** Subscribe to add-viz intents. Returns the latest intent (or null) and
 *  re-renders on every fire. Used by the FloatingAssistant. */
export function useAddVizIntent(): AddVizIntent | null {
  const [intent, setIntent] = useState<AddVizIntent | null>(null);
  useEffect(() => {
    const l: AddVizListener = (i) => setIntent(i);
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, []);
  return intent;
}
