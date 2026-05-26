'use client';

import { useMemo, useState } from 'react';
import type { VegaSpec } from '../../types/genui';
import VegaChart from '../VegaChart';
import { useDashboardEdit } from '../../lib/dashboard-edit-context';
import { pinsApi } from '../../lib/pins-api';
import { enrichAgentSpec } from '../../lib/enrich-vega-spec';

// One `chart` GenUI block. Wraps VegaChart with a conditional
// "Save to dashboard" affordance — visible only when the dashboard-edit
// context is active (i.e. the chat is rendering inside a dashboard that is
// in admin edit mode). Outside that context the wrapper renders an ordinary
// chart and the wrapper is invisible.

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

  if (!editCtx?.canGenerate) {
    return <VegaChart spec={enriched} saveable />;
  }

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
