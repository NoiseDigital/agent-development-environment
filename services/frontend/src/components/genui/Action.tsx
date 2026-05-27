'use client';

// Invisible side-effect block — when the dashboard editor agent asks the
// frontend to "do" something (pin a chart, recolour the banner, rename the
// dashboard), it emits one of these in `ui[]`. The block runs the action
// against the dashboard's persistence layer on mount and shows a small
// confirmation line below the chat bubble.
//
// Outside a dashboard context (no `useDashboardEdit`), the block degrades
// to "no dashboard to edit" — it never crashes the chat.

import { useEffect, useMemo, useState } from 'react';
import type { ActionProps } from '../../types/genui';
import { useDashboardEdit } from '../../lib/dashboard-edit-context';
import { runDashboardAction, type ActionResult } from '../../lib/dashboard-actions';
import { loadBlockState, saveBlockState } from '../../lib/genui-state';

export default function Action({
  props,
  messageId,
  blockIndex,
}: {
  props: ActionProps;
  messageId?: string;
  blockIndex?: number;
}) {
  const editCtx = useDashboardEdit();
  // Restore a prior result first — if this block already ran in a previous
  // mount we render its outcome and SKIP the side-effect entirely. This is
  // what keeps the "✓ applied" line stable across session switches / reloads,
  // and crucially prevents a pin_chart from running twice.
  const restored = useMemo(
    () => loadBlockState<ActionResult>(messageId, blockIndex ?? 0),
    [messageId, blockIndex],
  );
  const [result, setResult] = useState<ActionResult | null>(restored);
  const [started, setStarted] = useState(restored !== null);

  useEffect(() => {
    if (started) return;
    setStarted(true);
    if (!editCtx) {
      const r = { ok: false, message: 'No dashboard context' } as ActionResult;
      setResult(r);
      saveBlockState<ActionResult>(messageId, blockIndex ?? 0, r);
      return;
    }
    void runDashboardAction(props, {
      dashboardId: editCtx.dashboardId,
      tabId: editCtx.tabId,
    }).then((r) => {
      setResult(r);
      saveBlockState<ActionResult>(messageId, blockIndex ?? 0, r);
      // Pin succeeded → tell the parent dashboard to re-derive its tile list
      // so the new chart shows up immediately.
      if (r.ok && props.kind === 'pin_chart') editCtx.onPinned();
    });
    // The Action block is one-shot per turn; ignoring further renders is
    // intentional. `started` gates re-firing on parent re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!result) {
    return (
      <p className="mt-1 inline-flex items-center gap-1.5 text-[10px] text-zinc-500">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-zinc-500" />
        Applying…
      </p>
    );
  }

  return (
    <p
      className={`mt-1 inline-flex items-center gap-1.5 text-[10px] ${
        result.ok ? 'text-emerald-400' : 'text-red-400'
      }`}
    >
      <span>{result.ok ? '✓' : '⚠'}</span>
      <span>{result.message}</span>
    </p>
  );
}
