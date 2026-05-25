import { describe, it, expect } from 'vitest';
import { checkVegaSpec } from './vega-guard';

describe('vega-guard.checkVegaSpec', () => {
  it('allows a simple allow-listed bar chart', () => {
    expect(
      checkVegaSpec({
        data: { values: [{ x: 'a', y: 1 }] },
        mark: 'bar',
        encoding: { x: { field: 'x' }, y: { field: 'y' } },
      }),
    ).toEqual({ ok: true });
  });

  it('accepts a rect mark — needed for heatmaps', () => {
    expect(
      checkVegaSpec({
        data: { values: [{ r: 0, c: 0, v: 1 }] },
        mark: { type: 'rect' },
        encoding: {},
      }).ok,
    ).toBe(true);
  });

  it('rejects a mark not on the allowlist', () => {
    const r = checkVegaSpec({
      data: { values: [{ x: 1, y: 2 }] },
      mark: 'geoshape',
      encoding: {},
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/geoshape/);
  });

  it('rejects a spec with no mark at all', () => {
    const r = checkVegaSpec({ data: { values: [] } });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no chart mark/);
  });

  it('walks layered specs and rejects if any layer mark is off-list', () => {
    const r = checkVegaSpec({
      data: { values: [{ x: 1 }] },
      layer: [{ mark: 'bar' }, { mark: { type: 'image' } }],
    });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/image/);
  });

  it('walks faceted specs and accepts inner marks', () => {
    expect(
      checkVegaSpec({
        data: { values: [{ x: 1, g: 'a' }] },
        facet: { field: 'g' },
        spec: { mark: 'area', encoding: {} },
      }).ok,
    ).toBe(true);
  });

  it('caps inline data at 5000 rows', () => {
    const values = Array.from({ length: 5001 }, (_, i) => ({ x: i }));
    const r = checkVegaSpec({ data: { values }, mark: 'bar', encoding: {} });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/exceeds/);
  });
});
