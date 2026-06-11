// One source of truth for the dashboard context string the floating
// assistant and Noise Analyst prepend onto agent inputs. Centralised so the
// analyst, the editor, and the insights tile see the SAME context shape —
// a divergence here would mean "what the agent thinks the user is looking
// at" silently differs from the actual tab.
//
// Format (one chunk, single newline-separated message preamble):
//
//   [Dashboard context: id=<id>, tab=<tabId>, name=<dashboard name>, mode=view|edit]
//   Active tab: <tab label>
//   Other tabs: <comma-separated labels>
//   Tiles on this tab:
//   - KPI: Spend
//   - Trend: total_spend over time
//   - Breakdown: total_spend by publisher
//   ...
//
// The first line is the legacy shape the dashboard_editor_agent already
// parses — KEEP it byte-compatible. Everything below is additive and only
// the analyst's new prompt reads it.

import type {
  DashboardTile,
  DashboardTab,
} from '../../data/dashboards';

export type DashboardMode = 'view' | 'edit';

export interface DashboardContextInput {
  dashboardId: string;
  dashboardName: string;
  /** The tab the user is currently looking at. */
  activeTab: { id: string; label: string; tiles: DashboardTile[] };
  /** ALL tabs on the dashboard — used to render the "other tabs" hint so the
   *  agent can route the user. The active tab is filtered out internally. */
  tabs: DashboardTab[];
  mode: DashboardMode;
}

/** Turn one tile into one bullet line. Pure; no formatting beyond a leading
 *  dash + a short type label + the most identifying field (title / metric)
 *  + the stable tile id the editor agent uses to address the tile in
 *  `update_tile` / `remove_tile` actions.
 *  Unknown / future tile types fall through to a generic line so the agent
 *  still sees there's *something* there. */
export function tileManifestLine(tile: DashboardTile): string {
  const id = ` [id=${tile.id}]`;
  switch (tile.type) {
    case 'kpi':
      return `- KPI: ${tile.label}${id}`;
    case 'trend':
      return tile.secondaryMetric
        ? `- Trend: ${tile.metric} + ${tile.secondaryMetric} over time${id}`
        : `- Trend: ${tile.metric} over time${id}`;
    case 'breakdown':
      return `- Breakdown: ${tile.metric ?? 'total_spend'} by ${tile.source}${id}`;
    case 'pivot': {
      const dims = tile.innerDim
        ? `${tile.outerDim} × ${tile.innerDim}`
        : tile.outerDim;
      return `- Pivot: ${tile.title} (${dims})${id}`;
    }
    case 'quadrant':
      return `- Quadrant: ${tile.title} (${tile.dim}; ${tile.xMetric} vs ${tile.yMetric})${id}`;
    case 'pareto':
      return `- Pareto: ${tile.title}${id}`;
    case 'pacing':
      return `- Pacing: ${tile.title}${id}`;
    case 'heatmap':
      return `- Heatmap: ${tile.title}${id}`;
    case 'narrative':
      return `- Narrative: ${tile.title}${id}`;
    case 'chart':
      // User-pinned Vega spec — the title lives in the spec when present.
      // Falling back to "Pinned chart" keeps the line useful when it doesn't.
      return `- Chart: ${chartTitle(tile.chart) ?? 'Pinned chart'}${id}`;
    case 'text':
      return `- Text note: ${tile.text.slice(0, 60).replace(/\s+/g, ' ').trim()}${id}`;
    default: {
      // Exhaustiveness — caught at compile time, not at runtime.
      const _exhaustive: never = tile;
      void _exhaustive;
      return `- Unknown tile${id}`;
    }
  }
}

function chartTitle(spec: unknown): string | null {
  if (!spec || typeof spec !== 'object') return null;
  const t = (spec as { title?: unknown }).title;
  if (typeof t === 'string' && t.trim()) return t.trim();
  if (t && typeof t === 'object' && typeof (t as { text?: unknown }).text === 'string') {
    const text = (t as { text: string }).text.trim();
    return text || null;
  }
  return null;
}

/** Build the full multi-line context preamble. Pure — given the same input
 *  it returns the same string, so it's safe to use as a stable agent prefix. */
export function buildDashboardContext(input: DashboardContextInput): string {
  const { dashboardId, dashboardName, activeTab, tabs, mode } = input;
  const legacyHeader = `[Dashboard context: id=${dashboardId}, tab=${activeTab.id}, name=${dashboardName}, mode=${mode}]`;
  const otherTabs = tabs
    .filter((t) => t.id !== activeTab.id)
    .map((t) => t.label)
    .filter(Boolean);
  const tilesBlock =
    activeTab.tiles.length > 0
      ? `Tiles on this tab:\n${activeTab.tiles.map(tileManifestLine).join('\n')}`
      : 'Tiles on this tab: (none)';
  const lines = [
    legacyHeader,
    `Active tab: ${activeTab.label}`,
    otherTabs.length > 0 ? `Other tabs: ${otherTabs.join(', ')}` : null,
    tilesBlock,
  ];
  return lines.filter((l): l is string => l !== null).join('\n');
}

/** Compact JSON-friendly tile manifest for non-prompt consumers (e.g. the
 *  insights agent payload). Same labels as the human-readable form, just
 *  shaped as an array for downstream code that wants to ferry it through
 *  a JSON payload. */
export function tileManifestList(tiles: DashboardTile[]): string[] {
  return tiles.map(tileManifestLine);
}

/** Strip the dashboard-context preamble from a stored user message so the
 *  rendered bubble shows just what the user actually typed. Idempotent —
 *  messages without the preamble pass through unchanged. */
export function stripDashboardContext(text: string): string {
  if (!text.startsWith('[Dashboard context:')) return text;
  const split = text.indexOf('\n\n');
  if (split === -1) return text;
  return text.slice(split + 2);
}
