'use client';

import { useMemo, useState } from 'react';
import type { VegaSpec } from '../../types/genui';
import VegaChart from '../VegaChart';
import { useDashboardEdit } from '../../lib/dashboard-edit-context';
import { pinsApi } from '../../lib/pins-api';
import { enrichAgentSpec } from '../../lib/enrich-vega-spec';
import SaveToDashboardMenu from '../chat/SaveToDashboardMenu';

// One `chart` GenUI block. Wraps VegaChart with a "Save to dashboard"
// affordance. Two flavours, picked by context:
//
//   1. INSIDE a dashboard edit-mode context — the target tab is already
//      implied by where the user is, so we keep the one-click "Save to
//      <tab>" button.
//   2. OUTSIDE that context (normal chat surface, AnalyzeAssistantPanel,
//      etc.) — we show SaveToDashboardMenu, a dropdown that lists the
//      user's personal reports and includes a "Create new personal report"
//      affordance. Same hierarchy as the dashboards listing page.

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
    } catch {
      setState('error');
    }
  };

  // ── Path 2: chat-only context (most agent-generated charts) ───────────
  // Show the dashboard-picker menu — pick any personal report or create
  // a fresh one inline. No dashboard-edit context needed.
  if (!editCtx?.canGenerate) {
    return (
      <div className="space-y-1.5">
        <VegaChart spec={enriched} saveable />
        <div className="flex justify-end">
          <SaveToDashboardMenu spec={spec} />
        </div>
      </div>
    );
  }

  // ── Path 1: inside a dashboard in edit mode ──────────────────────────
  // Target tab is implied; keep the one-click flow.
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
          className="flex items-center gap-1.5 rounded-md border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] font-medium text-zinc-300 transition-colors hover:border-zinc-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
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
