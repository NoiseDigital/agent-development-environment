import { describe, it, expect } from 'vitest';
import { enrichAgentSpec } from './enrich-vega-spec';

describe('enrichAgentSpec', () => {
  it('adds compactNum + $ format to a currency quantitative y axis', () => {
    const enriched = enrichAgentSpec({
      mark: 'bar',
      encoding: {
        x: { field: 'publisher', type: 'nominal' },
        y: { field: 'total_spend', type: 'quantitative' },
      },
    }) as Record<string, unknown>;
    const enc = enriched.encoding as Record<string, unknown>;
    const y = enc.y as { axis?: { format?: string; formatType?: string } };
    expect(y.axis?.formatType).toBe('compactNum');
    expect(y.axis?.format).toBe('$');
  });

  it('adds compactNum + % format to a rate field', () => {
    const enriched = enrichAgentSpec({
      mark: 'line',
      encoding: {
        x: { field: 'name', type: 'temporal' },
        y: { field: 'ctr', type: 'quantitative' },
      },
    }) as Record<string, unknown>;
    // Line+temporal triggers crosshair wrap, encoding moves into layer[0].
    const layer = enriched.layer as Array<{ encoding?: Record<string, unknown> }>;
    const y = layer?.[0]?.encoding?.y as { axis?: { format?: string; formatType?: string } };
    expect(y.axis?.formatType).toBe('compactNum');
    expect(y.axis?.format).toBe('%');
  });

  it('wraps a temporal-x line chart with a crosshair rule layer', () => {
    const enriched = enrichAgentSpec({
      mark: 'line',
      encoding: {
        x: { field: 'name', type: 'temporal' },
        y: { field: 'value', type: 'quantitative' },
        tooltip: [{ field: 'value', type: 'quantitative' }],
      },
    }) as Record<string, unknown>;
    expect(Array.isArray(enriched.layer)).toBe(true);
    const layers = enriched.layer as Array<{ mark?: unknown; params?: unknown[] }>;
    expect(layers).toHaveLength(2);
    const rule = layers[1];
    expect(Array.isArray(rule.params)).toBe(true);
    expect((rule.params as Array<{ name?: string }>)[0]?.name).toBe('hover');
  });

  it('hoists x to the outer encoding so the hover rule snaps to nearest point', () => {
    // The reported bug: hover showed the same single data point everywhere.
    // Root cause: x lived on the line layer only, so the rule layer had no
    // x channel for the `nearest: true` selection to snap to. Pin the fix.
    const enriched = enrichAgentSpec({
      mark: 'line',
      encoding: {
        x: { field: 'name', type: 'temporal' },
        y: { field: 'value', type: 'quantitative' },
      },
    }) as Record<string, unknown>;
    const outerEncoding = enriched.encoding as { x?: { field?: string } };
    expect(outerEncoding?.x?.field).toBe('name');
    const params = (enriched.layer as Array<{ params?: unknown[] }>)[1]?.params;
    const select = (params?.[0] as { select?: { fields?: string[] } })?.select;
    expect(select?.fields).toEqual(['name']);
  });

  it('passes a bar chart through without adding a crosshair', () => {
    const enriched = enrichAgentSpec({
      mark: 'bar',
      encoding: {
        x: { field: 'publisher', type: 'nominal' },
        y: { field: 'spend', type: 'quantitative' },
      },
    }) as Record<string, unknown>;
    expect(enriched.layer).toBeUndefined();
    expect(enriched.mark).toBe('bar');
  });

  it('is idempotent — enriching twice equals enriching once', () => {
    const input = {
      mark: 'line',
      encoding: {
        x: { field: 'name', type: 'temporal' },
        y: { field: 'spend', type: 'quantitative' },
      },
    };
    const once = enrichAgentSpec(input);
    const twice = enrichAgentSpec(once);
    expect(twice).toEqual(once);
  });

  it('preserves an existing format on a quantitative channel', () => {
    const enriched = enrichAgentSpec({
      mark: 'bar',
      encoding: {
        x: { field: 'name', type: 'nominal' },
        y: { field: 'value', type: 'quantitative', axis: { format: '.2f' } },
      },
    }) as Record<string, unknown>;
    const enc = enriched.encoding as Record<string, unknown>;
    const y = enc.y as { axis?: { format?: string; formatType?: string } };
    expect(y.axis?.format).toBe('.2f');
    expect(y.axis?.formatType).toBe('compactNum');
  });
});
