import { describe, it, expect } from 'vitest';
import type { DashboardTab, DashboardTile } from '../../data/dashboards';
import {
  buildDashboardContext,
  stripContextPreamble,
  tileManifestLine,
  tileManifestList,
} from './context';

// A small fixture covering the tile shapes the analyst is most likely to see.
const KPI: DashboardTile = {
  id: 'k1',
  layout: { x: 0, y: 0, w: 2, h: 1 },
  type: 'kpi',
  label: 'Spend',
  metric: 'total_spend',
  format: 'usdCompact',
};
const TREND: DashboardTile = {
  id: 't1',
  layout: { x: 0, y: 0, w: 4, h: 2 },
  type: 'trend',
  title: 'Spend trend',
  metric: 'total_spend',
};
const BREAKDOWN: DashboardTile = {
  id: 'b1',
  layout: { x: 0, y: 0, w: 4, h: 2 },
  type: 'breakdown',
  title: 'Spend by publisher',
  source: 'publisher',
  metric: 'total_spend',
};
const CHART_WITH_TITLE: DashboardTile = {
  id: 'c1',
  layout: { x: 0, y: 0, w: 4, h: 2 },
  type: 'chart',
  chart: { title: 'Weekly spend by publisher', mark: 'bar', encoding: {} },
};

describe('tileManifestLine', () => {
  it('formats a KPI by its label + id', () => {
    expect(tileManifestLine(KPI)).toBe('- KPI: Spend [id=k1]');
  });

  it('formats a trend by its metric + id', () => {
    expect(tileManifestLine(TREND)).toBe('- Trend: total_spend over time [id=t1]');
  });

  it('formats a breakdown by its source dimension + id', () => {
    expect(tileManifestLine(BREAKDOWN)).toBe(
      '- Breakdown: total_spend by publisher [id=b1]',
    );
  });

  it('formats a pinned chart by its spec title + id', () => {
    expect(tileManifestLine(CHART_WITH_TITLE)).toBe(
      '- Chart: Weekly spend by publisher [id=c1]',
    );
  });

  it('includes the tile id on EVERY line — the editor agent needs it to address tiles', () => {
    // Pin the contract: an `update_tile` / `remove_tile` action requires
    // the agent to pass a real id from the manifest. Without the id in the
    // line, the agent fabricates one and the action no-ops on the server.
    expect(tileManifestLine(KPI)).toMatch(/\[id=k1\]$/);
    expect(tileManifestLine(TREND)).toMatch(/\[id=t1\]$/);
    expect(tileManifestLine(BREAKDOWN)).toMatch(/\[id=b1\]$/);
    expect(tileManifestLine(CHART_WITH_TITLE)).toMatch(/\[id=c1\]$/);
  });
});

describe('buildDashboardContext', () => {
  const tabs: DashboardTab[] = [
    { id: 'overall', label: 'Overall', tiles: [KPI, TREND, BREAKDOWN] },
    { id: 'awareness', label: 'Awareness', tiles: [] },
    { id: 'engagement', label: 'Engagement', tiles: [] },
  ];

  it('keeps the legacy first line shape the editor agent parses', () => {
    const ctx = buildDashboardContext({
      dashboardId: 'NOI',
      dashboardName: 'NOI Performance',
      activeTab: tabs[0],
      tabs,
      mode: 'view',
    });
    // The editor's prompt parses this exact prefix shape — pin it.
    expect(ctx.split('\n')[0]).toBe(
      '[Dashboard context: id=NOI, tab=overall, name=NOI Performance, mode=view]',
    );
  });

  it('lists the other tabs the user could navigate to', () => {
    const ctx = buildDashboardContext({
      dashboardId: 'NOI',
      dashboardName: 'NOI Performance',
      activeTab: tabs[0],
      tabs,
      mode: 'view',
    });
    expect(ctx).toContain('Other tabs: Awareness, Engagement');
  });

  it('renders one manifest line per visible tile on the active tab', () => {
    const ctx = buildDashboardContext({
      dashboardId: 'NOI',
      dashboardName: 'NOI Performance',
      activeTab: tabs[0],
      tabs,
      mode: 'edit',
    });
    expect(ctx).toContain('Tiles on this tab:');
    expect(ctx).toContain('- KPI: Spend');
    expect(ctx).toContain('- Trend: total_spend over time');
    expect(ctx).toContain('- Breakdown: total_spend by publisher');
  });

  it('omits the other-tabs line when the dashboard has only one tab', () => {
    const ctx = buildDashboardContext({
      dashboardId: 'NOI',
      dashboardName: 'NOI Performance',
      activeTab: tabs[0],
      tabs: [tabs[0]],
      mode: 'view',
    });
    expect(ctx).not.toContain('Other tabs:');
  });
});

describe('tileManifestList', () => {
  it('returns one line per tile as a flat string array', () => {
    expect(tileManifestList([KPI, TREND])).toEqual([
      '- KPI: Spend [id=k1]',
      '- Trend: total_spend over time [id=t1]',
    ]);
  });
});

describe('stripContextPreamble', () => {
  it('removes a multi-line dashboard preamble + the blank separator', () => {
    const text =
      '[Dashboard context: id=NOI, tab=overall, name=NOI Performance, mode=view]\n' +
      'Active tab: Overall\n' +
      'Tiles on this tab:\n- KPI: Spend\n\n' +
      'What was our top publisher?';
    expect(stripContextPreamble(text)).toBe('What was our top publisher?');
  });

  it('removes the AutoCorr / Market Radar preambles too', () => {
    expect(
      stripContextPreamble('[AutoCorr context]\nsource: upload:abc\nstatus: result\n\nTell me about it'),
    ).toBe('Tell me about it');
    expect(
      stripContextPreamble('[Market Radar context]\nmode: advanced\n\ni ran the analysis'),
    ).toBe('i ran the analysis');
  });

  it('passes through messages that have no preamble', () => {
    expect(stripContextPreamble('Plot weekly spend in 2024.')).toBe(
      'Plot weekly spend in 2024.',
    );
  });

  it('is idempotent — already-stripped text round-trips unchanged', () => {
    const clean = 'Show CTR by creative format.';
    expect(stripContextPreamble(stripContextPreamble(clean))).toBe(clean);
  });
});
