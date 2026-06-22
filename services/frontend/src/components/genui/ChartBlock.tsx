'use client';

import { useMemo, useState } from 'react';
import type { VegaSpec } from '../../types/genui';
import VegaChart from '../VegaChart';
import { useDashboardEdit } from '../../lib/dashboards/edit-context';
import { pinsApi } from '../../lib/dashboards/pins-api';
import { enrichAgentSpec } from '../../lib/charts/enrich-spec';

// One `chart` GenUI block. Wraps VegaChart with a save affordance.
//
//   • INSIDE a dashboard edit-mode context, the target tab is implied by
//     where the user is, so we render a one-click "Save to <tab>" button.
//   • OUTSIDE that context (normal chat, AutocorrAssistantPanel, etc.) we
//     rely on the kebab inside the chart card (ChartActions, surfaced via
//     `saveable`) — it already handles dashboard + tab picking AND has a
//     "Create new personal report" affordance. No second button needed.

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

export default function ChartBlock({ spec }: { spec: VegaSpec }) {
  const editCtx = useDashboardEdit();
  const [state, setState] = useState<SaveState>('idle');
  // Enrich the agent's spec at render time — compactNum on quantitative
  // channels, crosshair on line charts — so chat visuals match the
  // dashboard tiles without bloating the agent prompt.
  const enriched = useMemo(() => enrichAgentSpec(spec), [spec]);

  const handleSave = async () => {
    if (!editCtx || state === 'saving' || state === 'saved') return;
    setState('saving');
    try {
      await pinsApi.create(editCtx.dashboardId, editCtx.tabId, spec);
      setState('saved');
      editCtx.onPinned();
    } catch (err) {
      console.warn('[ChartBlock] quick-save pin failed', editCtx.dashboardId, editCtx.tabId, err);
      setState('error');
    }
  };

  // Chat-only path — the in-card kebab (`saveable`) carries the full
  // save-to-dashboard + create-new flow, no extra button needed.
  if (!editCtx?.canGenerate) {
    return <VegaChart spec={enriched} saveable />;
  }

  // Inside a dashboard in edit mode — target tab is implied; keep the
  // one-click flow. The kebab still works as a secondary path (pick a
  // different dashboard, export, etc.).
  const label =
    state === 'saving' ? 'Saving…'
    : state === 'saved' ? `Saved to ${editCtx.tabLabel}`
    : state === 'error' ? 'Save failed — retry'
    : `Save to ${editCtx.tabLabel}`;

  return (
    <div className="space-y-1.5">
      <VegaChart spec={enriched} saveable />
      <div className="flex justify-end">
        <button
          type="button"
          disabled={state === 'saving' || state === 'saved'}
          onClick={handleSave}
          title={`Pin this chart to ${editCtx.tabLabel}`}
          className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2.5 py-1 text-[11px] font-medium text-muted transition-colors hover:border-line-strong hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {label}
        </button>
      </div>
    </div>
  );
}
