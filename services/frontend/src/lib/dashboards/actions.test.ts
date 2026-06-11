// @vitest-environment happy-dom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { runDashboardAction, type DashboardActionContext } from './actions';
import { pinsApi } from './pins-api';
import { loadDashboardOverrides } from './overrides';
import { saveUserDashboard } from './user-dashboards';

vi.mock('./pins-api', () => ({
  pinsApi: {
    list: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

const mockedCreate = vi.mocked(pinsApi.create);
const mockedRemove = vi.mocked(pinsApi.remove);

const ctx: DashboardActionContext = { dashboardId: 'dash-1', tabId: 'overall' };

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  mockedCreate.mockResolvedValue({ id: 'pin-1', spec: {} });
  mockedRemove.mockResolvedValue(undefined);
});

afterEach(() => {
  window.localStorage.clear();
});

describe('runDashboardAction — set_accent', () => {
  it('normalises a hex with no leading hash and persists lowercase', async () => {
    const r = await runDashboardAction(
      { kind: 'set_accent', hex: 'AA0011' },
      ctx,
    );
    expect(r).toEqual({ ok: true, message: 'Banner → #aa0011' });
    expect(loadDashboardOverrides('dash-1').accentColor).toBe('#aa0011');
  });

  it('accepts a leading hash and 3-char form is rejected (only 6-hex supported)', async () => {
    const ok = await runDashboardAction({ kind: 'set_accent', hex: '#04AaBB' }, ctx);
    expect(ok.ok).toBe(true);
    expect(loadDashboardOverrides('dash-1').accentColor).toBe('#04aabb');

    const short = await runDashboardAction({ kind: 'set_accent', hex: '#abc' }, ctx);
    expect(short.ok).toBe(false);
    expect(short.message).toContain('Invalid colour');
  });

  it('rejects garbage and non-hex strings', async () => {
    for (const bad of ['', '   ', '#zzzzzz', 'rgb(1,2,3)', 'red', '#1234567']) {
      const r = await runDashboardAction({ kind: 'set_accent', hex: bad }, ctx);
      expect(r.ok).toBe(false);
    }
  });
});

describe('runDashboardAction — update_tile', () => {
  it('applies a multi-field patch (title + subtitle + valueFormat)', async () => {
    const r = await runDashboardAction(
      {
        kind: 'update_tile',
        tile_id: 'kpi-spend',
        presentation: { title: 'Total Spend', subtitle: 'YTD', valueFormat: '$' },
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    const tile = loadDashboardOverrides('dash-1').tilePresentation?.['kpi-spend'];
    expect(tile).toEqual({ title: 'Total Spend', subtitle: 'YTD', valueFormat: '$' });
  });

  it('treats empty-string fields and whitespace-only fields as missing', async () => {
    const r = await runDashboardAction(
      {
        kind: 'update_tile',
        tile_id: 'kpi-spend',
        presentation: { title: '', subtitle: '   ', description: 'real description' },
      },
      ctx,
    );
    expect(r.ok).toBe(true);
    const tile = loadDashboardOverrides('dash-1').tilePresentation?.['kpi-spend'];
    expect(tile).toEqual({ description: 'real description' });
    expect(tile?.title).toBeUndefined();
    expect(tile?.subtitle).toBeUndefined();
  });

  it('rejects an empty patch entirely (nothing to update)', async () => {
    const r = await runDashboardAction(
      { kind: 'update_tile', tile_id: 'kpi-spend', presentation: {} },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.message).toContain('empty presentation patch');
  });

  it('rejects when tile_id is missing or blank', async () => {
    const blank = await runDashboardAction(
      { kind: 'update_tile', tile_id: '   ', presentation: { title: 'X' } },
      ctx,
    );
    expect(blank.ok).toBe(false);
    expect(blank.message).toBe('No tile id');
  });

  it('normalises an accent in the patch and rejects an invalid one', async () => {
    const ok = await runDashboardAction(
      {
        kind: 'update_tile',
        tile_id: 'kpi-spend',
        presentation: { accent: 'AA0011' },
      },
      ctx,
    );
    expect(ok.ok).toBe(true);
    expect(loadDashboardOverrides('dash-1').tilePresentation?.['kpi-spend']?.accent).toBe('#aa0011');

    const bad = await runDashboardAction(
      {
        kind: 'update_tile',
        tile_id: 'kpi-spend',
        presentation: { accent: 'not-a-colour' },
      },
      ctx,
    );
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain('Invalid colour');
  });

  it('is additive across calls (later patch merges over earlier)', async () => {
    await runDashboardAction(
      { kind: 'update_tile', tile_id: 'kpi-spend', presentation: { title: 'A', subtitle: 'B' } },
      ctx,
    );
    await runDashboardAction(
      { kind: 'update_tile', tile_id: 'kpi-spend', presentation: { title: 'A2' } },
      ctx,
    );
    const tile = loadDashboardOverrides('dash-1').tilePresentation?.['kpi-spend'];
    expect(tile).toEqual({ title: 'A2', subtitle: 'B' });
  });
});

describe('runDashboardAction — remove_tile', () => {
  it('calls pinsApi.remove for the tile id and adds to the soft-remove list', async () => {
    const r = await runDashboardAction(
      { kind: 'remove_tile', tile_id: 'pin-77' },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(mockedRemove).toHaveBeenCalledWith('pin-77');
    expect(loadDashboardOverrides('dash-1').removedTileIds).toContain('pin-77');
  });

  it('still soft-removes when pinsApi.remove rejects (404 fall-through)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mockedRemove.mockRejectedValueOnce(new Error('404'));
    const r = await runDashboardAction(
      { kind: 'remove_tile', tile_id: 'seed-tile-xyz' },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(loadDashboardOverrides('dash-1').removedTileIds).toContain('seed-tile-xyz');
    warn.mockRestore();
  });

  it('rejects when tile_id is missing', async () => {
    const r = await runDashboardAction(
      { kind: 'remove_tile', tile_id: '' },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(mockedRemove).not.toHaveBeenCalled();
  });
});

describe('runDashboardAction — rename_dashboard', () => {
  it('refuses to rename a code-defined dashboard (no localStorage spec)', async () => {
    const r = await runDashboardAction(
      { kind: 'rename_dashboard', name: 'Renamed' },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.message).toContain('code-defined');
  });

  it('renames a user dashboard when one exists in localStorage', async () => {
    saveUserDashboard({
      id: 'dash-1',
      name: 'Old',
      campaignId: 'c1',
      createdAt: '2026-01-01T00:00:00Z',
    });
    const r = await runDashboardAction(
      { kind: 'rename_dashboard', name: 'New Name' },
      ctx,
    );
    expect(r.ok).toBe(true);
    const stored = JSON.parse(window.localStorage.getItem('noise:user-dashboards')!);
    expect(stored[0]).toMatchObject({ id: 'dash-1', name: 'New Name', campaignId: 'c1' });
  });

  it('rejects empty / whitespace-only names', async () => {
    saveUserDashboard({
      id: 'dash-1', name: 'X', campaignId: 'c', createdAt: '2026-01-01',
    });
    expect((await runDashboardAction({ kind: 'rename_dashboard', name: '' }, ctx)).ok).toBe(false);
    expect((await runDashboardAction({ kind: 'rename_dashboard', name: '   ' }, ctx)).ok).toBe(false);
  });
});

describe('runDashboardAction — pin_chart', () => {
  it('pins a chart to the explicit tab_id', async () => {
    const spec = { mark: 'bar', data: { values: [{ x: 1 }] } } as Record<string, unknown>;
    const r = await runDashboardAction(
      { kind: 'pin_chart', tab_id: 'publisher', spec },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(mockedCreate).toHaveBeenCalledWith('dash-1', 'publisher', spec);
  });

  it('falls back to ctx.tabId when tab_id is omitted', async () => {
    const spec = { mark: 'bar' } as Record<string, unknown>;
    const r = await runDashboardAction(
      { kind: 'pin_chart', tab_id: '', spec },
      ctx,
    );
    expect(r.ok).toBe(true);
    expect(mockedCreate).toHaveBeenCalledWith('dash-1', 'overall', spec);
  });

  it('refuses an empty spec', async () => {
    const r = await runDashboardAction(
      { kind: 'pin_chart', tab_id: 'overall', spec: {} as Record<string, unknown> },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(mockedCreate).not.toHaveBeenCalled();
  });
});

describe('runDashboardAction — outer error wrap', () => {
  it('catches a thrown error from a downstream call and returns ok:false', async () => {
    mockedCreate.mockRejectedValueOnce(new Error('network down'));
    const r = await runDashboardAction(
      { kind: 'pin_chart', tab_id: 'overall', spec: { mark: 'bar' } as Record<string, unknown> },
      ctx,
    );
    expect(r.ok).toBe(false);
    expect(r.message).toBe('network down');
  });
});
