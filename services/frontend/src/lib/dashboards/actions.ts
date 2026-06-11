// Side-effect runners for the dashboard editor agent. Each handler takes
// the dashboard context (which dashboard the user is on) + the agent's
// action payload, and applies the change against the same persistence
// layer the dashboard UI itself uses — pinsApi for chart tiles,
// dashboard-overrides for accent, user-dashboards for renames.
//
// Returns a short user-facing summary string so the Action block can
// confirm what happened ("Pinned to Overall", "Banner → #047857").

import type { ActionProps, VegaSpec } from '../../types/genui';
import { pinsApi } from './pins-api';
import { markTileRemoved, setDashboardOverride, setTilePresentation } from './overrides';
import { isUserDashboard, saveUserDashboard, loadUserDashboards } from './user-dashboards';

export interface DashboardActionContext {
  dashboardId: string;
  /** Active tab id — used as the default target for pin_chart when the
   *  agent didn't include `tab_id`. */
  tabId: string;
  /** Best-effort campaign id on the user-dashboard spec (rename needs it
   *  to preserve the spec shape; client dashboards skip the rename). */
  campaignId?: string;
}

export interface ActionResult {
  ok: boolean;
  message: string;
}

/** Validate + run one action. Never throws — the chat UI catches errors via
 *  the returned `ok: false` so a malformed agent payload doesn't take down
 *  the bubble. */
export async function runDashboardAction(
  action: ActionProps,
  ctx: DashboardActionContext,
): Promise<ActionResult> {
  try {
    switch (action.kind) {
      case 'pin_chart':
        return await pinChart(action, ctx);
      case 'set_accent':
        return setAccent(action, ctx);
      case 'rename_dashboard':
        return renameDashboard(action, ctx);
      case 'update_tile':
        return updateTile(action, ctx);
      case 'remove_tile':
        return await removeTile(action, ctx);
      default: {
        // Exhaustive switch — TS catches missing kinds at compile time.
        const _exhaustive: never = action;
        void _exhaustive;
        return { ok: false, message: 'Unknown action' };
      }
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Action failed',
    };
  }
}

async function pinChart(
  action: Extract<ActionProps, { kind: 'pin_chart' }>,
  ctx: DashboardActionContext,
): Promise<ActionResult> {
  const tab = action.tab_id || ctx.tabId;
  if (!tab) return { ok: false, message: 'No tab to pin to' };
  if (!isValidSpec(action.spec)) return { ok: false, message: 'Chart spec was empty' };
  await pinsApi.create(ctx.dashboardId, tab, action.spec);
  return { ok: true, message: `Pinned to ${tab}` };
}

function setAccent(
  action: Extract<ActionProps, { kind: 'set_accent' }>,
  ctx: DashboardActionContext,
): ActionResult {
  const hex = normaliseHex(action.hex);
  if (!hex) return { ok: false, message: `Invalid colour: ${action.hex}` };
  setDashboardOverride(ctx.dashboardId, 'accentColor', hex);
  // The header reads the override on mount via DashboardDetail's effect; a
  // page-level event lets us nudge it to re-read without a remount.
  window.dispatchEvent(
    new CustomEvent('dashboard-override-changed', {
      detail: { dashboardId: ctx.dashboardId },
    }),
  );
  return { ok: true, message: `Banner → ${hex}` };
}

function renameDashboard(
  action: Extract<ActionProps, { kind: 'rename_dashboard' }>,
  ctx: DashboardActionContext,
): ActionResult {
  const name = action.name?.trim();
  if (!name) return { ok: false, message: 'Empty name' };
  // Only user-created dashboards are renamable at runtime — client dashboards
  // are code-defined seeds.
  if (!isUserDashboard(ctx.dashboardId)) {
    return { ok: false, message: 'This dashboard is code-defined — can\'t rename at runtime' };
  }
  const spec = loadUserDashboards().find((d) => d.id === ctx.dashboardId);
  saveUserDashboard({
    id: ctx.dashboardId,
    name,
    campaignId: spec?.campaignId ?? ctx.campaignId ?? '',
    createdAt: spec?.createdAt ?? new Date().toISOString(),
    defaultTabId: spec?.defaultTabId,
  });
  window.dispatchEvent(
    new CustomEvent('dashboard-renamed', {
      detail: { dashboardId: ctx.dashboardId, name },
    }),
  );
  return { ok: true, message: `Renamed to ${name}` };
}

function updateTile(
  action: Extract<ActionProps, { kind: 'update_tile' }>,
  ctx: DashboardActionContext,
): ActionResult {
  const tileId = action.tile_id?.trim();
  if (!tileId) return { ok: false, message: 'No tile id' };
  const patch = pickPresentation(action.presentation);
  if (Object.keys(patch).length === 0) {
    return { ok: false, message: 'Nothing to update — empty presentation patch' };
  }
  // If the patch carries an accent hex, normalise it so a typo'd colour
  // surfaces before we persist (matches set_accent's contract).
  if (patch.accent !== undefined) {
    const hex = normaliseHex(patch.accent);
    if (!hex) return { ok: false, message: `Invalid colour: ${patch.accent}` };
    patch.accent = hex;
  }
  setTilePresentation(ctx.dashboardId, tileId, patch);
  // Same nudge channel the accent change uses — DashboardDetail listens and
  // re-reads overrides so the change shows without a remount.
  window.dispatchEvent(
    new CustomEvent('dashboard-override-changed', {
      detail: { dashboardId: ctx.dashboardId },
    }),
  );
  const summary = Object.keys(patch)
    .map((k) => `${k}=${patch[k as keyof typeof patch]}`)
    .join(', ');
  return { ok: true, message: `Updated tile ${tileId} (${summary})` };
}

async function removeTile(
  action: Extract<ActionProps, { kind: 'remove_tile' }>,
  ctx: DashboardActionContext,
): Promise<ActionResult> {
  const tileId = action.tile_id?.trim();
  if (!tileId) return { ok: false, message: 'No tile id' };
  // Try pinsApi.remove first — pinned chart tiles have a server-side
  // delete. If that errors with a 404 we fall through to the soft-remove
  // path (code-defined seed tiles).
  try {
    await pinsApi.remove(tileId);
  } catch (err) {
    console.warn('[actions.removeTile] pin remove failed; soft-removing', tileId, err);
  }
  markTileRemoved(ctx.dashboardId, tileId);
  window.dispatchEvent(
    new CustomEvent('dashboard-override-changed', {
      detail: { dashboardId: ctx.dashboardId },
    }),
  );
  return { ok: true, message: `Removed tile ${tileId}` };
}

/** Strip undefined fields from the agent's payload so the persistence layer
 *  doesn't store an explicit `undefined` (which would otherwise mask a
 *  later "reset to seed" intent). */
function pickPresentation(p: Extract<ActionProps, { kind: 'update_tile' }>['presentation']): Record<string, string> {
  const out: Record<string, string> = {};
  for (const k of ['title', 'subtitle', 'description', 'valueFormat', 'accent'] as const) {
    const v = p?.[k];
    if (typeof v === 'string' && v.trim() !== '') out[k] = v;
  }
  return out;
}

function isValidSpec(spec: VegaSpec): boolean {
  return !!spec && typeof spec === 'object' && Object.keys(spec).length > 0;
}

const HEX_RE = /^#?([0-9a-f]{6})$/i;
function normaliseHex(value: string): string | null {
  const m = HEX_RE.exec(value?.trim() ?? '');
  return m ? `#${m[1].toLowerCase()}` : null;
}
